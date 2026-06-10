import { logger, task, wait } from '@trigger.dev/sdk'
import {
  dripDone,
  getState,
  sendServiceWriterNudge1Email,
  sendServiceWriterNudge2Email,
  sendOnce,
  sendOwnerGapEmail,
  sendWelcomeOwnerEmail,
  shouldSendDripStep,
  triggerInternalFollowUp,
} from '@/lib/activation'

function dripStepDedupeKey(step: string): string {
  return `drip:${step}`
}

export const activationDripTask = task({
  id: 'activation-drip',
  retry: { maxAttempts: 3 },
  run: async (payload: { locationId: string }) => {
    const locationId = payload.locationId.trim()
    if (!locationId) throw new Error('locationId is required')

    async function exitIfDone(phase: string) {
      const state = await getState(locationId)
      if (!state) {
        logger.log('activation-drip exit', { locationId, phase, reason: 'no_state' })
        return { exit: 'no_state', phase }
      }
      const reason = dripDone(state)
      if (reason) {
        logger.log('activation-drip exit', { locationId, phase, reason })
        return { exit: reason, phase }
      }
      return null
    }

    // T0 — owner welcome email (service writer setup email sends at signup)
    let early = await exitIfDone('t0')
    if (early) return early

    const state0 = await getState(locationId)
    if (state0 && (await shouldSendDripStep(locationId, 'welcome_email'))) {
      await sendOnce(locationId, dripStepDedupeKey('welcome_email'), () =>
        sendWelcomeOwnerEmail(state0),
      )
    }

    // T+2 — nudge1
    await wait.for({ days: 2, idempotencyKey: `activation-drip:${locationId}:wait-2d` })
    early = await exitIfDone('t2')
    if (early) return early

    const state2 = await getState(locationId)
    if (state2 && (await shouldSendDripStep(locationId, 'nudge_1'))) {
      await sendOnce(locationId, dripStepDedupeKey('nudge_1'), () =>
        sendServiceWriterNudge1Email(state2),
      )
    }

    // T+5 — owner email by gap
    await wait.for({ days: 3, idempotencyKey: `activation-drip:${locationId}:wait-5d` })
    early = await exitIfDone('t5')
    if (early) return early

    const state5 = await getState(locationId)
    if (state5 && (await shouldSendDripStep(locationId, 'owner_gap_email'))) {
      await sendOnce(locationId, dripStepDedupeKey('owner_gap_email'), () =>
        sendOwnerGapEmail(state5),
      )
    }

    // T+7 — nudge2 + CALL
    await wait.for({ days: 2, idempotencyKey: `activation-drip:${locationId}:wait-7d` })
    early = await exitIfDone('t7')
    if (early) return early

    const state7 = await getState(locationId)
    if (state7 && (await shouldSendDripStep(locationId, 'nudge_2'))) {
      await sendOnce(locationId, dripStepDedupeKey('nudge_2'), () =>
        sendServiceWriterNudge2Email(state7),
      )
    }

    // T+14 — internal follow-up for high-value shops still without inbound
    await wait.for({ days: 7, idempotencyKey: `activation-drip:${locationId}:wait-14d` })
    early = await exitIfDone('t14')
    if (early) return early

    const state14 = await getState(locationId)
    if (
      state14?.is_high_value &&
      !state14.first_inbound_at &&
      (await shouldSendDripStep(locationId, 'internal_high_value'))
    ) {
      await sendOnce(
        locationId,
        dripStepDedupeKey('internal_high_value'),
        async () => {
          await triggerInternalFollowUp({
            locationId,
            reason: 'never-activated-high-value',
            shopName: state14.shopName,
          })
        },
        { reason: 'never-activated-high-value' },
      )
    }

    logger.log('activation-drip completed', { locationId })
    return { completed: true }
  },
})
