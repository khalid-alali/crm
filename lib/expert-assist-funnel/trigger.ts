/**
 * @deprecated Import from `@/lib/activation` or `@/lib/activation/trigger` instead.
 */
export {
  ACTIVATION_TASK_IDS,
  enqueueExpertAssistDormantCheck,
  enqueueExpertAssistOnStageChanged,
  enqueueExpertAssistStageSync,
  enqueueStageChangedSideEffects,
  triggerActivationDrip,
  triggerConsultCompleted,
  triggerDormancyCheck,
  triggerHandleCallRequest,
  triggerHandlePhotoReceived,
  triggerHandleReferral,
  triggerInboundSms,
  triggerInternalFollowUp,
} from '@/lib/activation/trigger'

export type {
  ConsultCompletedTriggerPayload,
  DormancyCheckTriggerPayload,
  HandleCallRequestTaskPayload,
  InboundSmsTriggerPayload,
  InternalFollowUpTaskPayload,
  StageChangedTaskPayload,
} from '@/lib/activation/types'
