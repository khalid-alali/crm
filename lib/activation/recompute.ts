import type { SupabaseClient } from '@supabase/supabase-js'
import { logShopEvent } from '@/lib/activation/events'
import { computeStage, isActivationStage } from '@/lib/activation/stages'
import { ensureActivationState } from '@/lib/activation/state'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import type { ActivationStage, RecomputeStageResult } from '@/lib/activation/types'

async function syncEnrollmentStageCache(
  supabase: SupabaseClient,
  locationId: string,
  stage: ActivationStage,
  nowIso: string,
): Promise<string | null> {
  const { data: enrollment, error } = await supabase
    .from('location_program_enrollments')
    .select('id, manual_stage_override')
    .eq('location_id', locationId)
    .eq('program_id', EXPERT_ASSIST_PROGRAM_ID)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!enrollment) return null

  const manualOverride = (enrollment as { manual_stage_override?: boolean }).manual_stage_override
  if (!manualOverride) {
    const { error: updateError } = await supabase
      .from('location_program_enrollments')
      .update({ stage, last_touched_at: nowIso })
      .eq('id', (enrollment as { id: string }).id)

    if (updateError) throw new Error(updateError.message)
  }

  return (enrollment as { id: string }).id
}

/** Sole writer of activation_state.stage and stage_changed_at. */
export async function recomputeStage(
  supabase: SupabaseClient,
  locationId: string,
  opts?: { nowMs?: number },
): Promise<RecomputeStageResult | null> {
  const row = await ensureActivationState(supabase, locationId)
  const previousStage: ActivationStage = isActivationStage(row.stage) ? row.stage : 'invited'

  const stage = computeStage(
    {
      signed_up_at: row.signed_up_at,
      first_inbound_at: row.first_inbound_at,
      first_consult_at: row.first_consult_at,
      last_consult_at: row.last_consult_at,
      consult_count: row.consult_count,
    },
    { nowMs: opts?.nowMs },
  )

  const { data: enrollment } = await supabase
    .from('location_program_enrollments')
    .select('id')
    .eq('location_id', locationId)
    .eq('program_id', EXPERT_ASSIST_PROGRAM_ID)
    .maybeSingle()

  const enrollmentId = (enrollment as { id: string } | null)?.id ?? null
  if (!enrollmentId) return null

  if (stage === previousStage) {
    return { locationId, enrollmentId, previousStage, stage, changed: false }
  }

  const nowIso = new Date(opts?.nowMs ?? Date.now()).toISOString()
  const { error: updateError } = await supabase
    .from('activation_state')
    .update({ stage, stage_changed_at: nowIso })
    .eq('location_id', locationId)

  if (updateError) throw new Error(updateError.message)

  await logShopEvent(supabase, locationId, 'stage.changed', `${previousStage}->${stage}:${nowIso}`, {
    from: previousStage,
    to: stage,
  })

  const syncedEnrollmentId = await syncEnrollmentStageCache(supabase, locationId, stage, nowIso)

  const { enqueueStageChangedSideEffects } = await import('@/lib/activation/trigger')
  await enqueueStageChangedSideEffects({
    locationId,
    enrollmentId: syncedEnrollmentId,
    previousStage,
    stage,
  })

  return {
    locationId,
    enrollmentId: syncedEnrollmentId ?? enrollmentId,
    previousStage,
    stage,
    changed: true,
  }
}
