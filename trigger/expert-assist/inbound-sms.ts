import { logger, queue, task } from '@trigger.dev/sdk'
import {
  ensureActivationState,
  recomputeStage,
  setFirstInboundIfNull,
  triggerHandleCallRequest,
} from '@/lib/activation'
import { notifyExpertAssistSlack } from '@/lib/expert-assist/slack'

const inboundSmsQueue = queue({
  name: 'activation-inbound-sms',
  concurrencyLimit: 1,
})

const CALL_PATTERN = /^\s*CALL\s*$/i

export const inboundSmsTask = task({
  id: 'inbound-sms',
  queue: inboundSmsQueue,
  run: async (payload: {
    locationId: string
    messageId: string
    body?: string | null
    caseId?: string | null
    fromPhone?: string | null
    shopName?: string | null
  }) => {
    const locationId = payload.locationId.trim()
    const messageId = payload.messageId.trim()
    if (!locationId || !messageId) throw new Error('locationId and messageId are required')

    await ensureActivationState(locationId)
    await setFirstInboundIfNull(locationId)

    const stageResult = await recomputeStage(locationId)

    const body = payload.body?.trim() ?? ''
    const shopName = payload.shopName?.trim() || locationId

    if (payload.caseId) {
      await notifyExpertAssistSlack({
        type: 'open',
        caseId: payload.caseId,
        shopName,
        source: 'sms',
      })
    } else {
      logger.log('Inbound SMS processed without open case', { locationId, messageId })
    }

    if (CALL_PATTERN.test(body) && payload.fromPhone?.trim()) {
      await triggerHandleCallRequest({
        locationId,
        phoneNumber: payload.fromPhone.trim(),
        caseId: payload.caseId ?? null,
        messageId,
      })
    }

    return {
      ok: true,
      stage: stageResult?.stage ?? null,
      stageChanged: stageResult?.changed ?? false,
      callRequested: CALL_PATTERN.test(body),
    }
  },
})
