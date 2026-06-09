import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveProgramStage } from '@/lib/program-stage'
import { EXPERT_ASSIST_PROGRAM_ID, getProgramConfig } from '@/lib/program-config'

type EnrollmentRow = {
  id: string
  location_id: string
  program_id: string
  stage: string
  manual_stage_override: boolean
  first_job_completed_at: string | null
  unenrolled_at: string | null
}

type ChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
  completed_by_user_id: string | null
  notes: string | null
}

export async function getActiveEnrollment(
  supabaseAdmin: SupabaseClient,
  input: { locationId: string; programId: string },
): Promise<EnrollmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, location_id, program_id, stage, manual_stage_override, first_job_completed_at, unenrolled_at')
    .eq('location_id', input.locationId)
    .eq('program_id', input.programId)
    .is('unenrolled_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as EnrollmentRow | null) ?? null
}

async function buildReenrollChecklistSeed(
  supabaseAdmin: SupabaseClient,
  input: { locationId: string; programId: string; newEnrollmentId: string },
): Promise<
  Array<{
    enrollment_id: string
    item_key: string
    completed_at: string | null
    completed_by_user_id: string | null
    notes: string | null
  }>
> {
  const config = getProgramConfig(input.programId)
  const definedKeys = new Set((config?.checklist ?? []).map(item => item.key))

  const { data: historicalEnrollments, error: enrollmentsError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, unenrolled_at, created_at')
    .eq('location_id', input.locationId)
    .eq('program_id', input.programId)
    .neq('id', input.newEnrollmentId)
    .order('created_at', { ascending: false })

  if (enrollmentsError) throw new Error(enrollmentsError.message)

  const historicalIds = (historicalEnrollments ?? []).map(row => row.id as string)
  if (historicalIds.length === 0) {
    return [...definedKeys].map(item_key => ({
      enrollment_id: input.newEnrollmentId,
      item_key,
      completed_at: null,
      completed_by_user_id: null,
      notes: null,
    }))
  }

  const { data: historicalChecklist, error: checklistError } = await supabaseAdmin
    .from('program_enrollment_checklist')
    .select('enrollment_id, item_key, completed_at, completed_by_user_id, notes, updated_at')
    .in('enrollment_id', historicalIds)
    .order('updated_at', { ascending: false })

  if (checklistError) throw new Error(checklistError.message)

  const byItem = new Map<
    string,
    { completed_at: string | null; completed_by_user_id: string | null; notes: string | null }
  >()
  for (const row of (historicalChecklist ?? []) as Array<ChecklistRow & { updated_at?: string }>) {
    if (byItem.has(row.item_key)) continue
    byItem.set(row.item_key, {
      completed_at: row.completed_at ?? null,
      completed_by_user_id: row.completed_by_user_id ?? null,
      notes: row.notes ?? null,
    })
  }

  const keys = new Set<string>([...definedKeys, ...byItem.keys()])
  return [...keys].map(item_key => {
    const fromHistory = byItem.get(item_key)
    return {
      enrollment_id: input.newEnrollmentId,
      item_key,
      completed_at: fromHistory?.completed_at ?? null,
      completed_by_user_id: fromHistory?.completed_by_user_id ?? null,
      notes: fromHistory?.notes ?? null,
    }
  })
}

export async function enrollLocationInProgram(
  supabaseAdmin: SupabaseClient,
  input: { locationId: string; programId: string; actorId: string | null },
) {
  const active = await getActiveEnrollment(supabaseAdmin, {
    locationId: input.locationId,
    programId: input.programId,
  })
  if (active) return { enrollmentId: active.id, created: false }

  const now = new Date().toISOString()
  const initialStage = input.programId === EXPERT_ASSIST_PROGRAM_ID ? 'invited' : 'not_ready'
  const { data: createdRow, error: createError } = await supabaseAdmin
    .from('location_program_enrollments')
    .insert({
      location_id: input.locationId,
      program_id: input.programId,
      stage: initialStage,
      enrolled_at: now,
      enrolled_by_user_id: input.actorId,
      last_touched_at: now,
      manual_stage_override: false,
      unenrolled_at: null,
      unenrolled_by_user_id: null,
      unenroll_reason: null,
    })
    .select('id')
    .single()

  if (createError || !createdRow?.id) throw new Error(createError?.message ?? 'Could not create enrollment')

  const checklistRows = await buildReenrollChecklistSeed(supabaseAdmin, {
    locationId: input.locationId,
    programId: input.programId,
    newEnrollmentId: createdRow.id as string,
  })

  if (checklistRows.length > 0) {
    const { error: checklistInsertError } = await supabaseAdmin
      .from('program_enrollment_checklist')
      .upsert(
        checklistRows.map(row => ({
          ...row,
          updated_at: now,
        })),
        { onConflict: 'enrollment_id,item_key' },
      )
    if (checklistInsertError) throw new Error(checklistInsertError.message)
  }

  if (input.programId !== EXPERT_ASSIST_PROGRAM_ID) {
    const completedKeys = checklistRows
      .filter(row => Boolean(row.completed_at))
      .map(row => row.item_key)

    const stage = deriveProgramStage({
      programId: input.programId,
      checklistCompletedKeys: completedKeys,
      firstJobCompletedAt: null,
      currentStage: 'not_ready',
      manualStageOverride: false,
    })

    const { error: stageError } = await supabaseAdmin
      .from('location_program_enrollments')
      .update({ stage, last_touched_at: now })
      .eq('id', createdRow.id)
    if (stageError) throw new Error(stageError.message)
  }

  return { enrollmentId: createdRow.id as string, created: true }
}

export async function unenrollEnrollment(
  supabaseAdmin: SupabaseClient,
  input: { enrollmentId: string; actorId: string | null; reason: string | null },
) {
  const now = new Date().toISOString()
  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, location_id, program_id, unenrolled_at')
    .eq('id', input.enrollmentId)
    .single()
  if (loadError || !enrollment) throw new Error(loadError?.message ?? 'Enrollment not found')
  if (enrollment.unenrolled_at) return enrollment

  const { data, error } = await supabaseAdmin
    .from('location_program_enrollments')
    .update({
      unenrolled_at: now,
      unenrolled_by_user_id: input.actorId,
      unenroll_reason: input.reason,
      last_touched_at: now,
    })
    .eq('id', input.enrollmentId)
    .select('id, location_id, program_id, unenrolled_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}
