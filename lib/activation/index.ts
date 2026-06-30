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
  markDor75Sent,
  markRefPush1Sent,
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
  sendMoneyKeptEmail,
  sendMuscleMemoryEmail,
  sendRefPush1Email,
  sendServiceWriterNudge1Email,
  sendServiceWriterNudge2Email,
  sendServiceWriterSetupEmail,
  sendOwnerGapEmail,
  sendPhotoReceivedOwnerEmail,
  sendPrintoutPhotoFrontDeskSms,
  sendReactivationEmail,
  sendReferralBookedOwnerEmail,
  sendWelcomeOwnerEmail,
} from '@/lib/activation/emails'

export {
  sendBillingDunningOwnerSms,
  sendBillingFailureOwnerEmail,
  sendCounterCardPhotoChaseSms,
  sendDor75WinbackSms,
  sendInvite1Email,
  sendInvite2Email,
  sendInvite3Email,
  sendPostFirstConsultFrontDeskSms,
  sendRefPush2Sms,
  sendWelcomeKitShippedEmail,
} from '@/lib/activation/lifecycle-emails'

export {
  ACTIVATION_TASK_IDS,
  enqueueExpertAssistDormantCheck,
  enqueueExpertAssistOnStageChanged,
  enqueueExpertAssistStageSync,
  enqueueStageChangedSideEffects,
  triggerActivationDrip,
  triggerBillingDunning,
  triggerConsultCompleted,
  triggerCounterCardChase,
  triggerDormancyCheck,
  triggerHandleCallRequest,
  triggerHandlePhotoReceived,
  triggerHandleReferral,
  triggerInboundSms,
  triggerInternalFollowUp,
  triggerInviteChase,
  triggerPostFirstConsult,
  triggerRefPushFollowup,
} from '@/lib/activation/trigger'

export {
  AUTO_RESOLVED_EXPERT_ASSIST_CHECKLIST_KEYS,
  activationFieldForChecklistKey,
  checklistCompletedAtFromActivation,
  isAutoResolvedExpertAssistChecklistKey,
  isExpertAssistChecklistItemReadOnly,
} from '@/lib/activation/checklist'
