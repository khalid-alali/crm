import { logger, task } from '@trigger.dev/sdk'
import { getState, logShopEvent, sendOnce } from '@/lib/activation'
import { sendTwilioSmsWithoutLog } from '@/lib/expert-assist/send-sms'
import { postExpertAssistSlack } from '@/lib/expert-assist/slack'

const CONFIRM_SMS =
  process.env.EXPERT_ASSIST_CALL_CONFIRM_SMS?.trim() ||
  'Got it — we received your CALL request. A Fixlane expert will reach out shortly to schedule your walkthrough.'

export const handleCallRequestTask = task({
  id: 'handle-call-request',
  run: async (payload: {
    locationId: string
    phoneNumber: string
    caseId?: string | null
    messageId?: string | null
  }) => {
    const locationId = payload.locationId.trim()
    const phoneNumber = payload.phoneNumber.trim()
    if (!locationId || !phoneNumber) throw new Error('locationId and phoneNumber are required')

    const dedupeKey =
      payload.messageId?.trim() ?
        `walkthrough:${payload.messageId}`
      : `walkthrough:${locationId}:${phoneNumber}`

    const logged = await logShopEvent(locationId, 'walkthrough_requested', dedupeKey, {
      phoneNumber,
      caseId: payload.caseId ?? null,
    })

    if (!logged.inserted) {
      logger.log('Duplicate walkthrough request — skipping sends', { locationId, dedupeKey })
      return { ok: true, duplicate: true }
    }

    await sendOnce(locationId, `call-confirm-sms:${dedupeKey}`, async () => {
      await sendTwilioSmsWithoutLog(phoneNumber, CONFIRM_SMS)
      return {
        channel: 'sms',
        to: phoneNumber,
        subject: 'CALL request confirmation SMS',
        body: CONFIRM_SMS,
      }
    })

    const ctx = await getState(locationId)
    const shopLabel = ctx?.shopName ?? locationId
    await postExpertAssistSlack(
      `Expert Assist CALL request — ${shopLabel} (${phoneNumber})${payload.caseId ? ` case ${payload.caseId}` : ''}`,
    )

    return { ok: true, duplicate: false }
  },
})
