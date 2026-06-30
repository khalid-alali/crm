import { logger, task, wait } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  sendOnce,
  sendPostFirstConsultFrontDeskSms,
} from '@/lib/activation'
import {
  act2ShouldSend,
  shouldPausePromotionalLifecycle,
  shouldSkipFrontDeskSms,
} from '@/lib/activation/suppression'
import { supabaseAdmin } from '@/lib/supabase'

/** ACT2-1 — 14d after first consult if no second consult and no inbound since. */
export const postFirstConsultTask = task({
  id: 'post-first-consult',
  retry: { maxAttempts: 3 },
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

    await ensureActivationState(locationId)

    await wait.for({ days: 14, idempotencyKey: `post-first-consult:${consultId}` })

    if (await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)) {
      return { exit: 'billing_paused' }
    }

    const ctx = await getState(locationId)
    if (!ctx) return { exit: 'no_state' }
    if (!act2ShouldSend(ctx, anchor)) return { exit: 'suppressed' }
    if (shouldSkipFrontDeskSms(ctx)) return { exit: 'sms_dead' }

    await sendOnce(locationId, `act2-1:${consultId}`, () => sendPostFirstConsultFrontDeskSms(ctx))

    logger.log('post-first-consult sent', { locationId, consultId })
    return { sent: true }
  },
})
