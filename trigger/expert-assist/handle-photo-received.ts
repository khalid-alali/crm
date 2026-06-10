import { task } from '@trigger.dev/sdk'
import { runHandlePhotoReceived } from '@/lib/activation/handle-photo-received-run'

export const handlePhotoReceivedTask = task({
  id: 'handle-photo-received',
  retry: { maxAttempts: 3 },
  queue: { concurrencyLimit: 1 },
  run: runHandlePhotoReceived,
})
