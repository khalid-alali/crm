import { logger, task, wait } from '@trigger.dev/sdk'
import {
  getState,
  markDor75Sent,
  recomputeStage,
  sendDor75WinbackSms,
  sendMuscleMemoryEmail,
  sendOnce,
  sendReactivationEmail,
  triggerInternalFollowUp,
} from '@/lib/activation'
import {
  dor75ShouldSend,
  shouldPausePromotionalLifecycle,
  shouldSkipFrontDeskSms,
} from '@/lib/activation/suppression'
import { supabaseAdmin } from '@/lib/supabase'

const MUSCLE_MEMORY_DAYS = 21
const REACTIVATION_EXTRA_DAYS = 39
const DOR75_EXTRA_DAYS = 15

async function lastConsultAfterAnchor(locationId: string, anchorIso: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('activation_state')
    .select('last_consult_at')
    .eq('location_id', locationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const last = (data as { last_consult_at: string | null } | null)?.last_consult_at
  if (!last) return null
  if (Date.parse(last) > Date.parse(anchorIso)) return last
  return null
}

export const dormancyCheckTask = task({
  id: 'dormancy-check',
  run: async (payload: {
    locationId: string
    consultId: string
    anchorClosedAt: string
  }) => {
    const locationId = payload.locationId.trim()
    const consultId = payload.consultId.trim()
    const anchor = payload.anchorClosedAt.trim()
    if (!locationId || !consultId || !anchor) {
      throw new Error('locationId, consultId, and anchorClosedAt are required')
    }

    if (Number.isNaN(Date.parse(anchor))) {
      throw new Error('anchorClosedAt must be a valid ISO timestamp')
    }

    await wait.for({
      days: MUSCLE_MEMORY_DAYS,
      idempotencyKey: `dormancy-muscle:${consultId}`,
    })

    const supersededAfterMuscle = await lastConsultAfterAnchor(locationId, anchor)
    if (supersededAfterMuscle) {
      logger.log('Dormancy run superseded after muscle-memory wait', {
        locationId,
        consultId,
        anchor,
        lastConsultAt: supersededAfterMuscle,
      })
      return { exit: 'superseded', phase: 'muscle_memory' }
    }

    const billingPaused = await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)
    const ctx = await getState(locationId)
    if (ctx && !billingPaused) {
      await sendOnce(locationId, `muscle-memory:${consultId}`, () => sendMuscleMemoryEmail(ctx))
    }

    await wait.for({
      days: REACTIVATION_EXTRA_DAYS,
      idempotencyKey: `dormancy-reactivation:${consultId}`,
    })

    const supersededAfterReactivation = await lastConsultAfterAnchor(locationId, anchor)
    if (supersededAfterReactivation) {
      logger.log('Dormancy run superseded after reactivation wait', {
        locationId,
        consultId,
        anchor,
        lastConsultAt: supersededAfterReactivation,
      })
      return { exit: 'superseded', phase: 'reactivation' }
    }

    const stageResult = await recomputeStage(locationId)
    const freshCtx = await getState(locationId)
    const billingPausedLate = await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)

    if (freshCtx && !billingPausedLate) {
      await sendOnce(locationId, `reactivation:${consultId}`, () => sendReactivationEmail(freshCtx))

      if (freshCtx.is_high_value) {
        await triggerInternalFollowUp({
          locationId,
          reason: 'dormant-high-value',
          shopName: freshCtx.shopName,
        })
      }
    }

    await wait.for({
      days: DOR75_EXTRA_DAYS,
      idempotencyKey: `dormancy-dor75:${consultId}`,
    })

    const supersededAfterDor75 = await lastConsultAfterAnchor(locationId, anchor)
    if (supersededAfterDor75) {
      return { exit: 'superseded', phase: 'dor75' }
    }

    const dorCtx = await getState(locationId)
    if (
      dorCtx &&
      !billingPausedLate &&
      dor75ShouldSend(dorCtx, anchor) &&
      !shouldSkipFrontDeskSms(dorCtx)
    ) {
      await sendOnce(locationId, `dor-75:${consultId}`, async () => {
        const meta = await sendDor75WinbackSms(dorCtx)
        await markDor75Sent(locationId)
        return meta
      })
    }

    return {
      exit: 'completed',
      stage: stageResult?.stage ?? null,
      stageChanged: stageResult?.changed ?? false,
    }
  },
})
