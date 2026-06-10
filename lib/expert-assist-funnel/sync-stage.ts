import type { SupabaseClient } from '@supabase/supabase-js'
import { getExpertAssistShopProgramView } from '@/lib/expert-assist-enrollments'
import type { ExpertAssistFunnelStage } from '@/lib/expert-assist-funnel/stages'

export type ExpertAssistStageSyncResult = {
  enrollmentId: string
  locationId: string
  previousStage: string
  stage: ExpertAssistFunnelStage
  changed: boolean
  manualStageOverride: boolean
}

export async function syncExpertAssistEnrollmentStage(
  supabaseAdmin: SupabaseClient,
  locationId: string,
  opts?: { nowMs?: number },
): Promise<ExpertAssistStageSyncResult | null> {
  const view = await getExpertAssistShopProgramView(supabaseAdmin, locationId, {
    nowMs: opts?.nowMs,
  })
  if (!view) return null

  const previousStage = view.stage
  if (view.manualStageOverride) {
    return {
      enrollmentId: view.id,
      locationId: view.locationId,
      previousStage,
      stage: view.stage,
      changed: false,
      manualStageOverride: true,
    }
  }

  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('stage')
    .eq('id', view.id)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)

  const storedStage = (enrollment as { stage?: string } | null)?.stage ?? previousStage
  const derivedStage = view.stage
  const changed = storedStage !== derivedStage

  if (changed) {
    const now = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('location_program_enrollments')
      .update({ stage: derivedStage, last_touched_at: now })
      .eq('id', view.id)

    if (updateError) throw new Error(updateError.message)
  }

  return {
    enrollmentId: view.id,
    locationId: view.locationId,
    previousStage: storedStage,
    stage: derivedStage,
    changed,
    manualStageOverride: false,
  }
}
