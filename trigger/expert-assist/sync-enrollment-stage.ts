import { logger, task } from '@trigger.dev/sdk'
import { recomputeStage } from '@/lib/activation'

/**
 * @deprecated Primary stage sync is `recomputeStage` from event handlers.
 * Kept for backwards-compatible triggers during cutover.
 */
export const expertAssistSyncEnrollmentStageTask = task({
  id: 'expert-assist-sync-enrollment-stage',
  run: async (payload: { locationId: string }) => {
    const locationId = payload.locationId.trim()
    if (!locationId) throw new Error('locationId is required')

    logger.warn('expert-assist-sync-enrollment-stage is deprecated — use recomputeStage', {
      locationId,
    })

    const result = await recomputeStage(locationId)

    return {
      synced: true,
      deprecated: true,
      changed: result?.changed ?? false,
      stage: result?.stage ?? null,
      previousStage: result?.previousStage ?? null,
    }
  },
})
