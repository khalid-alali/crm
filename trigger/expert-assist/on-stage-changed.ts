import { logger, task } from '@trigger.dev/sdk'
import { getState } from '@/lib/activation'
import { postExpertAssistSlack } from '@/lib/expert-assist/slack'

/** Slack side effects when activation_state.stage changes. Stage writes live in recomputeStage. */
export const expertAssistOnStageChangedTask = task({
  id: 'expert-assist-on-stage-changed',
  run: async (payload: {
    locationId: string
    enrollmentId: string | null
    previousStage: string
    stage: string
  }) => {
    const { locationId, previousStage, stage } = payload
    if (previousStage === stage) return { ok: true, skipped: true }

    const ctx = await getState(locationId)
    const shopName = ctx?.shopName ?? locationId

    logger.log('Expert Assist funnel stage changed', {
      locationId,
      previousStage,
      stage,
      enrollmentId: payload.enrollmentId,
    })

    if (stage === 'dormant' && ctx?.is_high_value) {
      await postExpertAssistSlack(
        `Expert Assist: ${shopName} moved to *dormant* (was ${previousStage}). High-value shop — consider outreach.`,
      )
    }

    if (stage === 'active' && previousStage !== 'active') {
      await postExpertAssistSlack(`Expert Assist: ${shopName} is now *Active* 🎉`)
    }

    return { ok: true, skipped: false }
  },
})
