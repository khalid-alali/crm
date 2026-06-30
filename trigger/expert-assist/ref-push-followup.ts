import { logger, task, wait } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  sendOnce,
  sendRefPush2Sms,
} from '@/lib/activation'
import {
  refPush2ShouldSend,
  shouldPausePromotionalLifecycle,
  shouldSkipFrontDeskSms,
} from '@/lib/activation/suppression'
import { supabaseAdmin } from '@/lib/supabase'

export const refPushFollowupTask = task({
  id: 'ref-push-followup',
  retry: { maxAttempts: 3 },
  run: async (payload: { locationId: string }) => {
    const locationId = payload.locationId.trim()
    if (!locationId) throw new Error('locationId is required')

    await ensureActivationState(locationId)

    await wait.for({ days: 7, idempotencyKey: `ref-push-followup:${locationId}` })

    if (await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)) {
      return { exit: 'billing_paused' }
    }

    const ctx = await getState(locationId)
    if (!ctx) return { exit: 'no_state' }
    if (!refPush2ShouldSend(ctx)) return { exit: 'suppressed' }
    if (shouldSkipFrontDeskSms(ctx)) return { exit: 'sms_dead' }

    await sendOnce(locationId, 'ref-push-2', () => sendRefPush2Sms(ctx))

    logger.log('ref-push-followup sent', { locationId })
    return { sent: true }
  },
})
