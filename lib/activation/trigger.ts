import type {
  ConsultCompletedTriggerPayload,
  DormancyCheckTriggerPayload,
  InboundSmsTriggerPayload,
  InternalFollowUpReason,
  StageChangedTaskPayload,
} from '@/lib/activation/types'

export const ACTIVATION_TASK_IDS = {
  activationDrip: 'activation-drip',
  inboundSms: 'inbound-sms',
  consultCompleted: 'consult-completed',
  dormancyCheck: 'dormancy-check',
  handleCallRequest: 'handle-call-request',
  handlePhotoReceived: 'handle-photo-received',
  handleReferral: 'handle-referral',
  onStageChanged: 'expert-assist-on-stage-changed',
  /** @deprecated Prefer recomputeStage from event handlers. */
  syncEnrollmentStage: 'expert-assist-sync-enrollment-stage',
  internalFollowUp: 'internal-follow-up',
} as const

const TASK_IDS = ACTIVATION_TASK_IDS

function triggerConfigured(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY?.trim())
}

async function getTasksClient(): Promise<typeof import('@trigger.dev/sdk').tasks | null> {
  if (!triggerConfigured()) return null
  const { tasks } = await import('@trigger.dev/sdk')
  return tasks
}

export async function triggerActivationDrip(locationId: string): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.activationDrip, { locationId }, {
    idempotencyKey: `activation-drip-${locationId}`,
  })
}

export async function triggerInboundSms(payload: InboundSmsTriggerPayload): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) {
    const { processInboundSmsAfterPersist } = await import('@/lib/expert-assist/inbound-sms')
    await processInboundSmsAfterPersist(payload)
    return
  }
  await tasks.trigger(TASK_IDS.inboundSms, payload, {
    idempotencyKey: `inbound-${payload.messageId}`,
    concurrencyKey: payload.locationId,
  })
}

export async function triggerConsultCompleted(payload: ConsultCompletedTriggerPayload): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.consultCompleted, payload, {
    idempotencyKey: `consult-${payload.consultId}`,
    concurrencyKey: payload.locationId,
  })
}

export async function triggerDormancyCheck(payload: DormancyCheckTriggerPayload): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.dormancyCheck, payload, {
    idempotencyKey: `dormancy-${payload.consultId}`,
  })
}

export async function triggerHandleCallRequest(payload: {
  locationId: string
  phoneNumber: string
  caseId?: string | null
  messageId?: string | null
}): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  const dedupe =
    payload.messageId?.trim() ?
      `call-${payload.messageId.trim()}`
    : `call-${payload.locationId}-${payload.phoneNumber}`
  await tasks.trigger(TASK_IDS.handleCallRequest, payload, {
    idempotencyKey: dedupe,
    concurrencyKey: payload.locationId,
  })
}

export async function triggerInternalFollowUp(payload: {
  locationId: string
  reason: InternalFollowUpReason
  shopName?: string | null
}): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.internalFollowUp, payload, {
    idempotencyKey: `internal-follow-up:${payload.locationId}:${payload.reason}`,
    concurrencyKey: payload.locationId,
  })
}

export async function enqueueStageChangedSideEffects(payload: StageChangedTaskPayload): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.onStageChanged, payload, {
    idempotencyKey: `stage-changed:${payload.locationId}:${payload.previousStage}:${payload.stage}`,
  })
}

/** @deprecated Prefer triggerConsultCompleted / recomputeStage from activation handlers. */
export async function enqueueExpertAssistStageSync(locationId: string): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) return
  await tasks.trigger(TASK_IDS.syncEnrollmentStage, { locationId }, {
    idempotencyKey: `sync-stage:${locationId}`,
    concurrencyKey: locationId,
  })
}

/** @deprecated Use triggerDormancyCheck. */
export async function enqueueExpertAssistDormantCheck(input: {
  locationId: string
  enrollmentId: string
  lastClosedAt: string
  consultId?: string
}): Promise<void> {
  await triggerDormancyCheck({
    locationId: input.locationId,
    consultId: input.consultId ?? `legacy-${input.lastClosedAt}`,
    anchorClosedAt: input.lastClosedAt,
  })
}

/** @deprecated Use enqueueStageChangedSideEffects. */
export async function enqueueExpertAssistOnStageChanged(input: StageChangedTaskPayload): Promise<void> {
  await enqueueStageChangedSideEffects(input)
}

export async function triggerHandlePhotoReceived(payload: {
  locationId: string
  dedupeKey: string
}): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) {
    const { runHandlePhotoReceived } = await import('@/lib/activation/handle-photo-received-run')
    await runHandlePhotoReceived(payload)
    return
  }
  await tasks.trigger(ACTIVATION_TASK_IDS.handlePhotoReceived, payload, {
    idempotencyKey: `photo-received:${payload.dedupeKey}`,
    concurrencyKey: payload.locationId,
  })
}

export async function triggerHandleReferral(payload: {
  locationId: string
  referralId: string
}): Promise<void> {
  const tasks = await getTasksClient()
  if (!tasks) {
    const { runHandleReferral } = await import('@/lib/activation/handle-referral-run')
    await runHandleReferral(payload)
    return
  }
  await tasks.trigger(ACTIVATION_TASK_IDS.handleReferral, payload, {
    idempotencyKey: `referral-booked:${payload.referralId}`,
    concurrencyKey: payload.locationId,
  })
}
