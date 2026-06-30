import { logger, task } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  markRefPush1Sent,
  recomputeStage,
  sendMoneyKeptEmail,
  sendOnce,
  sendRefPush1Email,
  triggerDormancyCheck,
  triggerPostFirstConsult,
  triggerRefPushFollowup,
  writeConsultFacts,
} from '@/lib/activation'
import { shouldPausePromotionalLifecycle } from '@/lib/activation/suppression'
import { supabaseAdmin } from '@/lib/supabase'

export const consultCompletedTask = task({
  id: 'consult-completed',
  run: async (payload: {
    locationId: string
    consultId: string
    closedAt: string
    amountLabel?: string
    amountCents?: number
    paid?: boolean
  }) => {
    const locationId = payload.locationId.trim()
    const consultId = payload.consultId.trim()
    const closedAt = payload.closedAt.trim()
    if (!locationId || !consultId || !closedAt) {
      throw new Error('locationId, consultId, and closedAt are required')
    }

    await ensureActivationState(locationId)
    const facts = await writeConsultFacts(locationId, consultId, closedAt)

    const stageResult = await recomputeStage(locationId)
    const ctx = await getState(locationId)
    const paid = payload.paid === true
    const billingPaused = await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)

    // MK-1: money-kept promotional email — only after confirmed payment, not on bare consult close.
    if (ctx && paid && !billingPaused) {
      await sendOnce(locationId, `money-kept:${consultId}`, () => sendMoneyKeptEmail(ctx, consultId))
    }

    // REF-PUSH-1: second completed consult (not stage transition).
    if (ctx && paid && !billingPaused && facts.consultCount === 2 && !ctx.ref_push_1_sent) {
      await sendOnce(locationId, 'ref-push-1', async () => {
        const meta = await sendRefPush1Email(ctx)
        await markRefPush1Sent(locationId)
        return meta
      })
      await triggerRefPushFollowup(locationId)
    }

    if (facts.firstConsult) {
      await triggerPostFirstConsult({ locationId, consultId, anchorClosedAt: closedAt })
    }

    await triggerDormancyCheck({
      locationId,
      consultId,
      anchorClosedAt: closedAt,
    })

    logger.log('Consult completed activation pipeline finished', {
      locationId,
      consultId,
      stage: stageResult?.stage ?? null,
      consultCount: facts.consultCount,
      paid,
    })

    return {
      ok: true,
      stage: stageResult?.stage ?? null,
      stageChanged: stageResult?.changed ?? false,
      consultCount: facts.consultCount,
    }
  },
})
