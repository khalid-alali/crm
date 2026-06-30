import { logger, task, wait } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  sendCounterCardPhotoChaseSms,
  sendOnce,
} from '@/lib/activation'
import { cc1ShouldSend, shouldPausePromotionalLifecycle, shouldSkipFrontDeskSms } from '@/lib/activation/suppression'
import { supabaseAdmin } from '@/lib/supabase'

export const counterCardChaseTask = task({
  id: 'counter-card-chase',
  retry: { maxAttempts: 3 },
  run: async (payload: { locationId: string; downloadedAt: string }) => {
    const locationId = payload.locationId.trim()
    const downloadedAt = payload.downloadedAt.trim()
    if (!locationId || !downloadedAt) {
      throw new Error('locationId and downloadedAt are required')
    }

    await ensureActivationState(locationId)

    await wait.for({ days: 3, idempotencyKey: `counter-card-chase:${locationId}:${downloadedAt.slice(0, 10)}` })

    if (await shouldPausePromotionalLifecycle(supabaseAdmin, locationId)) {
      return { exit: 'billing_paused' }
    }

    const ctx = await getState(locationId)
    if (!ctx) return { exit: 'no_state' }
    if (!cc1ShouldSend(ctx)) return { exit: 'suppressed' }
    if (shouldSkipFrontDeskSms(ctx)) return { exit: 'sms_dead' }

    await sendOnce(locationId, `cc-1:${downloadedAt.slice(0, 10)}`, () =>
      sendCounterCardPhotoChaseSms(ctx),
    )

    logger.log('counter-card-chase sent', { locationId })
    return { sent: true }
  },
})
