import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { deriveProgramStage, isTeslaStage } from '@/lib/program-stage'
import { VINFAST_PROGRAM_ID } from '@/lib/program-config'
import { unenrollEnrollment } from '@/lib/program-enrollment-service'
import {
  VINFAST_DEFAULT_OPS_WHEN_ACTIVE,
  VINFAST_DEFAULT_OPS_WHEN_NOT_READY,
} from '@/lib/vinfast-operational-status'
import { vfOnboardingStatusForKanbanStage } from '@/lib/vinfast-enrollments'

type PatchBody = {
  stage?: string
  tier?: 'generalist' | 'specialist' | null
  manual_stage_override?: boolean
  first_job_completed_at?: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, location_id, program_id, stage, manual_stage_override, first_job_completed_at, unenrolled_at')
    .eq('id', id)
    .single()

  if (loadError || !enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  if (enrollment.program_id !== VINFAST_PROGRAM_ID) {
    return NextResponse.json({ error: 'Only VinFast enrollments are editable here' }, { status: 400 })
  }
  if (enrollment.unenrolled_at) {
    return NextResponse.json({ error: 'Enrollment is no longer active' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    last_touched_at: new Date().toISOString(),
  }

  if (body.tier !== undefined) {
    if (body.tier !== null && body.tier !== 'generalist' && body.tier !== 'specialist') {
      return NextResponse.json({ error: 'Invalid tier value' }, { status: 400 })
    }
    patch.tier = body.tier
  }

  if (body.manual_stage_override !== undefined) {
    patch.manual_stage_override = Boolean(body.manual_stage_override)
  }

  if (body.stage !== undefined) {
    if (!isTeslaStage(body.stage)) {
      return NextResponse.json({ error: 'Invalid stage value' }, { status: 400 })
    }
    patch.stage = body.stage
    patch.manual_stage_override = true
  }

  if (body.first_job_completed_at !== undefined) {
    if (body.first_job_completed_at !== null && Number.isNaN(Date.parse(body.first_job_completed_at))) {
      return NextResponse.json({ error: 'Invalid first_job_completed_at' }, { status: 400 })
    }
    patch.first_job_completed_at = body.first_job_completed_at
  }

  const shouldAutoDerive =
    (body.first_job_completed_at !== undefined || body.manual_stage_override === false) &&
    patch.manual_stage_override !== true &&
    body.stage === undefined

  if (shouldAutoDerive) {
    const { data: checklistRows, error: checklistError } = await supabaseAdmin
      .from('program_enrollment_checklist')
      .select('item_key, completed_at')
      .eq('enrollment_id', id)

    if (checklistError) return NextResponse.json({ error: checklistError.message }, { status: 500 })

    const completedKeys = (checklistRows ?? [])
      .filter(row => !!row.completed_at)
      .map(row => row.item_key)

    patch.stage = deriveProgramStage({
      programId: enrollment.program_id,
      checklistCompletedKeys: completedKeys,
      firstJobCompletedAt:
        (patch.first_job_completed_at as string | null | undefined) ?? enrollment.first_job_completed_at,
      currentStage: isTeslaStage(enrollment.stage) ? enrollment.stage : 'not_ready',
      manualStageOverride:
        patch.manual_stage_override === undefined
          ? enrollment.manual_stage_override
          : Boolean(patch.manual_stage_override),
    })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('location_program_enrollments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (body.stage !== undefined && isTeslaStage(body.stage)) {
    const locUpdate: Record<string, string> = {}
    if (body.stage === 'active') {
      locUpdate.vf_operational_status = VINFAST_DEFAULT_OPS_WHEN_ACTIVE
    } else if (body.stage === 'not_ready') {
      locUpdate.vf_operational_status = VINFAST_DEFAULT_OPS_WHEN_NOT_READY
    }

    const { data: locRow, error: locLoadErr } = await supabaseAdmin
      .from('locations')
      .select('vf_onboarding_status')
      .eq('id', enrollment.location_id)
      .maybeSingle()
    if (locLoadErr) {
      console.error('VinFast stage load vf_onboarding_status:', locLoadErr.message)
    } else {
      const currentOnboarding = (locRow?.vf_onboarding_status as string | null | undefined) ?? ''
      const onboardingLower = currentOnboarding.trim().toLowerCase()
      if (body.stage === 'disqualified' || onboardingLower.includes('archived')) {
        locUpdate.vf_onboarding_status = vfOnboardingStatusForKanbanStage(body.stage)
      }
    }

    if (Object.keys(locUpdate).length > 0) {
      const { error: locErr } = await supabaseAdmin
        .from('locations')
        .update(locUpdate)
        .eq('id', enrollment.location_id)
      if (locErr) {
        console.error('VinFast stage location sync:', locErr.message)
      }
    }
  }

  revalidatePath('/vinfast')
  revalidatePath('/shops')
  return NextResponse.json(updated)
}

type UnenrollBody = {
  reason?: string | null
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let reason: string | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as UnenrollBody
    reason = body.reason == null ? null : String(body.reason).trim() || null
  } catch {
    reason = null
  }

  try {
    const updated = await unenrollEnrollment(supabaseAdmin, {
      enrollmentId: id,
      actorId: session.user?.email ?? null,
      reason,
    })
    await supabaseAdmin.from('activity_log').insert({
      location_id: updated.location_id,
      type: 'note',
      body: reason
        ? `Unenrolled from VinFast program. Reason: ${reason}`
        : 'Unenrolled from VinFast program.',
      sent_by: session.user?.email ?? 'unknown',
    })
    revalidatePath('/vinfast')
    revalidatePath('/shops')
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unenroll failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
