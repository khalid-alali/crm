import { logger, task, wait } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  sendBillingDunningOwnerSms,
  sendOnce,
} from '@/lib/activation'
import { supabaseAdmin } from '@/lib/supabase'

export const billingDunningTask = task({
  id: 'billing-dunning',
  retry: { maxAttempts: 3 },
  run: async (payload: {
    locationId: string
    failedAt: string
    amountLabel: string
  }) => {
    const locationId = payload.locationId.trim()
    const failedAt = payload.failedAt.trim()
    if (!locationId || !failedAt) throw new Error('locationId and failedAt are required')

    await ensureActivationState(locationId)

    await wait.for({ days: 3, idempotencyKey: `billing-dunning:${locationId}:${failedAt.slice(0, 10)}` })

    const { data: loc } = await supabaseAdmin
      .from('locations')
      .select('consult_billing_status')
      .eq('id', locationId)
      .maybeSingle()

    if ((loc as { consult_billing_status: string | null } | null)?.consult_billing_status !== 'payment_failed') {
      return { exit: 'billing_resolved' }
    }

    const ctx = await getState(locationId)
    if (!ctx?.ownerPhone?.trim()) return { exit: 'no_owner_phone' }

    await sendOnce(locationId, `bill-2:${failedAt.slice(0, 10)}`, () => sendBillingDunningOwnerSms(ctx))

    logger.log('billing-dunning sent', { locationId })
    return { sent: true }
  },
})
