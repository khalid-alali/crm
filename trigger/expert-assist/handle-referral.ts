import { task } from '@trigger.dev/sdk'
import { runHandleReferral } from '@/lib/activation/handle-referral-run'

export const handleReferralTask = task({
  id: 'handle-referral',
  retry: { maxAttempts: 3 },
  queue: { concurrencyLimit: 1 },
  run: runHandleReferral,
})
