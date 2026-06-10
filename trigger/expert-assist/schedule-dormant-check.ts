import { logger, task } from '@trigger.dev/sdk'
import { triggerDormancyCheck } from '@/lib/activation'

/**
 * @deprecated Replaced by `dormancy-check`. Forwards legacy payloads so in-flight runs can drain.
 */
export const expertAssistScheduleDormantCheckTask = task({
  id: 'expert-assist-schedule-dormant-check',
  run: async (payload: {
    locationId: string
    enrollmentId: string
    lastClosedAt: string
  }) => {
    const locationId = payload.locationId.trim()
    const lastClosedAt = payload.lastClosedAt.trim()
    if (!locationId || !lastClosedAt) throw new Error('locationId and lastClosedAt are required')

    logger.warn('expert-assist-schedule-dormant-check is deprecated — forwarding to dormancy-check', {
      locationId,
      enrollmentId: payload.enrollmentId,
    })

    await triggerDormancyCheck({
      locationId,
      consultId: `legacy-${lastClosedAt}`,
      anchorClosedAt: lastClosedAt,
    })

    return { forwarded: true, task: 'dormancy-check' }
  },
})
