export {
  ACTIVATION_ACTIVE_WINDOW_DAYS,
  computeStage,
  isActivationStage,
  isFirstTransitionToActive,
  secondConsultAt,
  type ComputeStageOptions,
} from '@/lib/activation/stages'

export {
  ACTIVATION_STAGES,
  ACTIVATION_VARIANTS,
  type ActivationCounterField,
  type ActivationSendContext,
  type ActivationShopContext,
  type ActivationStage,
  type ActivationStageFacts,
  type ActivationStateRow,
  type ActivationStateView,
  type ActivationTimestampField,
  type ActivationVariant,
  type ConsultCompletedTriggerPayload,
  type DormancyCheckTriggerPayload,
  type DripDoneReason,
  type DripStep,
  type InboundSmsTriggerPayload,
  type InternalFollowUpReason,
  type LogShopEventResult,
  type RecomputeStageResult,
  type WriteConsultFactsResult,
} from '@/lib/activation/types'

export {
  ensureActivationState,
  getState,
  getStateOrThrow,
  incrementCounter,
  logShopEvent,
  recomputeStage,
  sendOnce,
  setFirstInboundIfNull,
  shouldSendDripStep,
  writeConsultFacts,
  setSmsChannelDead,
  writeFactIfNull,
} from '@/lib/activation/bindings'

export { activationVariantFromSkipCard, recordExpertAssistSignup } from '@/lib/activation/signup'
export { recordExpertAssistCardAdded } from '@/lib/activation/card-added'

export { dripDone, sendOwnerEmailByGap, type OwnerGapEmailVariant } from '@/lib/activation/drip'

export {
  sendActiveReferralPushEmail,
  sendConsultReceiptIfPaid,
  sendFrontDeskWelcomeSms,
  sendMoneyKeptEmail,
  sendMuscleMemoryEmail,
  sendNudge1Sms,
  sendNudge2Sms,
  sendOwnerGapEmail,
  sendPhotoReceivedOwnerEmail,
  sendPrintoutPhotoFrontDeskSms,
  sendReactivationEmail,
  sendReferralBookedOwnerEmail,
  sendWelcomeOwnerEmail,
} from '@/lib/activation/emails'

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

export {
  AUTO_RESOLVED_EXPERT_ASSIST_CHECKLIST_KEYS,
  activationFieldForChecklistKey,
  checklistCompletedAtFromActivation,
  isAutoResolvedExpertAssistChecklistKey,
  isExpertAssistChecklistItemReadOnly,
} from '@/lib/activation/checklist'
