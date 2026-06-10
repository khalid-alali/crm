import { logger, task } from '@trigger.dev/sdk'
import type { InternalFollowUpReason } from '@/lib/activation/types'
import { crmPublicBaseUrl } from '@/lib/expert-assist/slack'
import { postExpertAssistSlack } from '@/lib/expert-assist/slack'

const REASON_LABELS: Record<InternalFollowUpReason, string> = {
  'never-activated-high-value': 'Never activated (high value)',
  'dormant-high-value': 'Dormant (high value)',
  'bad-frontdesk-number': 'Bad front desk number (SMS dead)',
}

export const internalFollowUpTask = task({
  id: 'internal-follow-up',
  run: async (payload: {
    locationId: string
    reason: InternalFollowUpReason
    shopName?: string | null
  }) => {
    const locationId = payload.locationId.trim()
    const reason = payload.reason
    if (!locationId || !reason) throw new Error('locationId and reason are required')

    const shop = payload.shopName?.trim() || locationId
    const label = REASON_LABELS[reason]
    const shopUrl = `${crmPublicBaseUrl()}/shops/${locationId}`

    logger.log('Internal follow-up queued', { locationId, reason, shop })

    await postExpertAssistSlack(
      [
        `Expert Assist — internal follow-up`,
        `Reason: ${label}`,
        `Shop: ${shop}`,
        `Location: ${locationId}`,
        `CRM: ${shopUrl}`,
      ].join('\n'),
    )

    return { ok: true, reason, locationId }
  },
})
