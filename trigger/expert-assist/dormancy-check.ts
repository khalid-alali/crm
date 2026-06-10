import { logger, task, wait } from '@trigger.dev/sdk'
import {
  getState,
  recomputeStage,
  sendMuscleMemoryEmail,
  sendOnce,
  sendReactivationEmail,
  triggerInternalFollowUp,
} from '@/lib/activation'
import { supabaseAdmin } from '@/lib/supabase'

const MUSCLE_MEMORY_DAYS = 21
const REACTIVATION_EXTRA_DAYS = 39

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

    const ctx = await getState(locationId)
    if (ctx) {
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

    if (freshCtx) {
      await sendOnce(locationId, `reactivation:${consultId}`, () => sendReactivationEmail(freshCtx))

      if (freshCtx.is_high_value) {
        await triggerInternalFollowUp({
          locationId,
          reason: 'dormant-high-value',
          shopName: freshCtx.shopName,
        })
      }
    }

    return {
      exit: 'completed',
      stage: stageResult?.stage ?? null,
      stageChanged: stageResult?.changed ?? false,
    }
  },
})
