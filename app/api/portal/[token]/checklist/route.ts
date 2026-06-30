import { NextRequest, NextResponse } from 'next/server'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { getProgramConfig } from '@/lib/program-config'
import { deriveProgramStage, isTeslaStage } from '@/lib/program-stage'
import { isShopOnboardingProgram, programHelpEmail, resolveShopChecklist } from '@/lib/portal-checklist'
import { loadShopSurveyState, surveyItemsForProgram } from '@/lib/portal-surveys'
import {
  assertEnrollmentOwned,
  assertShopCompletable,
  loadActiveEnrollmentsForLocation,
  loadChecklistRows,
  loadEnrollmentById,
} from '@/lib/portal-authz'
import { isPortalEnrollmentUnlocked, loadRoutableLocationRow } from '@/lib/portal-bank-gate'
import { supabaseAdmin } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function locationIdFromToken(token: string): string | null {
  try {
    return verifyCapabilitiesPortalToken(token).locationId
  } catch {
    return null
  }
}

// GET /api/portal/[token]/checklist
// Returns the shop's active programs and, for each, the curated two-sided
// checklist (shop-visible items only) with completion + blocked state.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const routableRow = await loadRoutableLocationRow(supabaseAdmin, locationId)
  if (!isPortalEnrollmentUnlocked(routableRow)) {
    return NextResponse.json(
      { error: 'Link your bank account to unlock the onboarding portal.', code: 'bank_gate_locked' },
      { status: 403 },
    )
  }

  const enrollments = (await loadActiveEnrollmentsForLocation(supabaseAdmin, locationId)).filter(e =>
    isShopOnboardingProgram(e.program_id),
  )
  const rows = await loadChecklistRows(
    supabaseAdmin,
    enrollments.map(e => e.id),
  )

  const completedByEnrollment = new Map<string, Record<string, string | null>>()
  for (const row of rows) {
    const map = completedByEnrollment.get(row.enrollment_id) ?? {}
    map[row.item_key] = row.completed_at
    completedByEnrollment.set(row.enrollment_id, map)
  }

  const surveyState = await loadShopSurveyState(supabaseAdmin, locationId)

  const programs = enrollments.map(enrollment => {
    const items = resolveShopChecklist(
      enrollment.program_id,
      completedByEnrollment.get(enrollment.id) ?? {},
    )
    return {
      enrollment_id: enrollment.id,
      program_id: enrollment.program_id,
      program_label: getProgramConfig(enrollment.program_id)?.label ?? enrollment.program_id,
      stage: enrollment.stage,
      help_email: programHelpEmail(enrollment.program_id),
      surveys: surveyItemsForProgram(surveyState, token, enrollment.program_id),
      items,
    }
  })

  return NextResponse.json({ programs })
}

type ChecklistPatchBody = {
  enrollment_id?: string
  item_key?: string
  completed?: boolean
  completed_by_name?: string | null
}

// PATCH /api/portal/[token]/checklist
// The shop marks one of its OWN items complete (or undoes it). Every check goes
// through the portal-authz guards — the JWT location is the only boundary.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const routableRow = await loadRoutableLocationRow(supabaseAdmin, locationId)
  if (!isPortalEnrollmentUnlocked(routableRow)) {
    return NextResponse.json(
      { error: 'Link your bank account to unlock the onboarding portal.', code: 'bank_gate_locked' },
      { status: 403 },
    )
  }

  let body: ChecklistPatchBody
  try {
    body = (await req.json()) as ChecklistPatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const enrollmentId = typeof body.enrollment_id === 'string' ? body.enrollment_id : ''
  if (!UUID_RE.test(enrollmentId)) {
    return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })
  }
  const itemKey = typeof body.item_key === 'string' ? body.item_key.trim().toLowerCase() : ''
  if (!itemKey) return NextResponse.json({ error: 'item_key is required' }, { status: 400 })

  // 1. Ownership: the enrollment must belong to THIS token's location and be active.
  const enrollment = await loadEnrollmentById(supabaseAdmin, enrollmentId)
  const owned = assertEnrollmentOwned(enrollment, locationId)
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status })

  // 2. Privilege: the shop may only complete shop-visible, completable items.
  const completable = assertShopCompletable(enrollment!.program_id, itemKey)
  if (!completable.ok) return NextResponse.json({ error: completable.error }, { status: completable.status })

  const completed = body.completed !== false // default true
  const completedAt = completed ? new Date().toISOString() : null
  const completedByName =
    completed && typeof body.completed_by_name === 'string'
      ? body.completed_by_name.trim().slice(0, 120) || null
      : null

  const { error: upsertError } = await supabaseAdmin.from('program_enrollment_checklist').upsert(
    {
      enrollment_id: enrollmentId,
      item_key: itemKey,
      completed_at: completedAt,
      completed_by_source: completed ? 'portal' : null,
      completed_by_name: completedByName,
      completed_by_user_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'enrollment_id,item_key' },
  )
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  // Re-derive the enrollment stage the same way the internal route does — some
  // shop-completable items (e.g. Tesla epc/toolbox/laptop/cables) are
  // requiredForStage, so completing them must advance getting_ready → ready.
  const enrollmentPatch: Record<string, unknown> = { last_touched_at: new Date().toISOString() }
  if (!enrollment!.manual_stage_override) {
    const { data: rows, error: listError } = await supabaseAdmin
      .from('program_enrollment_checklist')
      .select('item_key, completed_at')
      .eq('enrollment_id', enrollmentId)
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })
    const completedKeys = (rows ?? []).filter(r => r.completed_at).map(r => r.item_key)
    enrollmentPatch.stage = deriveProgramStage({
      programId: enrollment!.program_id,
      checklistCompletedKeys: completedKeys,
      firstJobCompletedAt: enrollment!.first_job_completed_at,
      currentStage: isTeslaStage(enrollment!.stage) ? enrollment!.stage : 'not_ready',
      manualStageOverride: enrollment!.manual_stage_override,
    })
  }
  await supabaseAdmin.from('location_program_enrollments').update(enrollmentPatch).eq('id', enrollmentId)

  return NextResponse.json({ ok: true, item_key: itemKey, completed_at: completedAt })
}
