import { logger, task, wait } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  getState,
  sendInvite1Email,
  sendInvite2Email,
  sendInvite3Email,
  sendOnce,
} from '@/lib/activation'
import { inviteChaseDone } from '@/lib/activation/suppression'

export const inviteChaseTask = task({
  id: 'invite-chase',
  retry: { maxAttempts: 3 },
  run: async (payload: { locationId: string }) => {
    const locationId = payload.locationId.trim()
    if (!locationId) throw new Error('locationId is required')

    await ensureActivationState(locationId)

    async function exitIfSignedUp(phase: string) {
      const state = await getState(locationId)
      if (!state) return { exit: 'no_state', phase }
      if (inviteChaseDone(state)) return { exit: 'signed_up', phase }
      return null
    }

    let early = await exitIfSignedUp('inv-1')
    if (early) return early

    const state0 = await getState(locationId)
    if (state0?.ownerEmail?.trim()) {
      await sendOnce(locationId, 'inv-1', () => sendInvite1Email(state0))
    }

    await wait.for({ days: 4, idempotencyKey: `invite-chase:${locationId}:wait-4d` })
    early = await exitIfSignedUp('inv-2')
    if (early) return early

    const state4 = await getState(locationId)
    if (state4?.ownerEmail?.trim()) {
      await sendOnce(locationId, 'inv-2', () => sendInvite2Email(state4))
    }

    await wait.for({ days: 2, idempotencyKey: `invite-chase:${locationId}:wait-6d` })
    early = await exitIfSignedUp('inv-3')
    if (early) return early

    const state6 = await getState(locationId)
    if (state6?.ownerEmail?.trim()) {
      await sendOnce(locationId, 'inv-3', () => sendInvite3Email(state6))
    }

    logger.log('invite-chase completed', { locationId })
    return { completed: true }
  },
})
