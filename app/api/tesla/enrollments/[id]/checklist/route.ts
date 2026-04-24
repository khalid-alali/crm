import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { TESLA_PROGRAM_ID, requiredChecklistKeys } from '@/lib/program-config'
import { deriveProgramStage, isTeslaStage } from '@/lib/program-stage'
import { supabaseAdmin } from '@/lib/supabase'

type ChecklistPatchBody = {
  item_key?: string
  completed?: boolean
  notes?: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let body: ChecklistPatchBody
  try {
    body = (await req.json()) as ChecklistPatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const itemKey = typeof body.item_key === 'string' ? body.item_key.trim().toLowerCase() : ''
  if (!itemKey) return NextResponse.json({ error: 'item_key is required' }, { status: 400 })

  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, program_id, stage, manual_stage_override, first_job_completed_at')
    .eq('id', id)
    .single()

  if (loadError || !enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  if (enrollment.program_id !== TESLA_PROGRAM_ID) {
    return NextResponse.json({ error: 'Only Tesla enrollments are editable here' }, { status: 400 })
  }

  if (!requiredChecklistKeys(enrollment.program_id).includes(itemKey)) {
    return NextResponse.json({ error: 'Unknown checklist item for this program' }, { status: 400 })
  }

  const completed = body.completed === true
  const completedAt = completed ? new Date().toISOString() : null
  const completedBy = completed ? (session.user?.email ?? null) : null
  const notes =
    body.notes === undefined ? undefined : body.notes == null ? null : String(body.notes).trim() || null

  const checklistPatch: Record<string, unknown> = {
    enrollment_id: id,
    item_key: itemKey,
    completed_at: completedAt,
    completed_by_user_id: completedBy,
    updated_at: new Date().toISOString(),
  }
  if (notes !== undefined) checklistPatch.notes = notes

  const { error: checklistError } = await supabaseAdmin
    .from('program_enrollment_checklist')
    .upsert(checklistPatch, { onConflict: 'enrollment_id,item_key' })

  if (checklistError) return NextResponse.json({ error: checklistError.message }, { status: 500 })

  const enrollmentPatch: Record<string, unknown> = {
    last_touched_at: new Date().toISOString(),
  }

  if (!enrollment.manual_stage_override) {
    const { data: checklistRows, error: listError } = await supabaseAdmin
      .from('program_enrollment_checklist')
      .select('item_key, completed_at')
      .eq('enrollment_id', id)

    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

    const completedKeys = (checklistRows ?? [])
      .filter(row => !!row.completed_at)
      .map(row => row.item_key)

    enrollmentPatch.stage = deriveProgramStage({
      programId: enrollment.program_id,
      checklistCompletedKeys: completedKeys,
      firstJobCompletedAt: enrollment.first_job_completed_at,
      currentStage: isTeslaStage(enrollment.stage) ? enrollment.stage : 'not_ready',
      manualStageOverride: enrollment.manual_stage_override,
    })
  }

  const { data: updatedEnrollment, error: enrollmentUpdateError } = await supabaseAdmin
    .from('location_program_enrollments')
    .update(enrollmentPatch)
    .eq('id', id)
    .select()
    .single()

  if (enrollmentUpdateError) return NextResponse.json({ error: enrollmentUpdateError.message }, { status: 500 })

  revalidatePath('/tesla')
  return NextResponse.json({ ok: true, enrollment: updatedEnrollment })
}
