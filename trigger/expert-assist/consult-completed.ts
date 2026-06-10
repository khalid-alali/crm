import { logger, task } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  isFirstTransitionToActive,
  recomputeStage,
  sendActiveReferralPushEmail,
  sendConsultReceiptIfPaid,
  sendMoneyKeptEmail,
  sendOnce,
  triggerDormancyCheck,
  writeConsultFacts,
} from '@/lib/activation'

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
    await writeConsultFacts(locationId, consultId, closedAt)

    const stageResult = await recomputeStage(locationId)
    const ctx = await getState(locationId)

    if (ctx) {
      await sendOnce(locationId, `money-kept:${consultId}`, () => sendMoneyKeptEmail(ctx, consultId))

      const paid = payload.paid === true
      const amountLabel = payload.amountLabel?.trim() || '$0.00'
      if (paid) {
        await sendOnce(locationId, `receipt:${consultId}`, () =>
          sendConsultReceiptIfPaid({ ctx, consultId, amountLabel, paid: true }),
        )
      }

      if (
        stageResult &&
        isFirstTransitionToActive(stageResult.previousStage, stageResult.stage)
      ) {
        await sendOnce(locationId, 'active-referral-push', () => sendActiveReferralPushEmail(ctx))
      }
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
    })

    return {
      ok: true,
      stage: stageResult?.stage ?? null,
      stageChanged: stageResult?.changed ?? false,
    }
  },
})
