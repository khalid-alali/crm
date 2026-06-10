export const ACTIVATION_STAGES = [
  'invited',
  'signed_up',
  'engaged',
  'activated',
  'active',
  'dormant',
] as const

export type ActivationStage = (typeof ACTIVATION_STAGES)[number]

export const ACTIVATION_VARIANTS = ['card_required', 'card_after_first_consult'] as const

export type ActivationVariant = (typeof ACTIVATION_VARIANTS)[number]

export type ActivationTimestampField =
  | 'card_added_at'
  | 'owner_forward_clicked_at'
  | 'service_writer_setup_email_sent_at'
  | 'counter_card_downloaded_at'
  | 'welcome_kit_shipped_at'
  | 'printout_photo_received_at'
  | 'qr_first_scanned_at'
  | 'free_consult_used_at'
  | 'signed_up_at'
  | 'first_inbound_at'
  | 'first_consult_at'
  | 'last_consult_at'
  | 'first_referral_at'
  | 'last_referral_at'

export type ActivationCounterField = 'consult_count' | 'referral_count' | 'qr_scan_count'

export type ActivationStateRow = {
  location_id: string
  card_added_at: string | null
  owner_forward_clicked_at: string | null
  service_writer_setup_email_sent_at: string | null
  counter_card_downloaded_at: string | null
  welcome_kit_shipped_at: string | null
  printout_photo_received_at: string | null
  qr_first_scanned_at: string | null
  free_consult_used_at: string | null
  signed_up_at: string | null
  first_inbound_at: string | null
  first_consult_at: string | null
  last_consult_at: string | null
  consult_count: number
  first_referral_at: string | null
  referral_count: number
  last_referral_at: string | null
  activation_variant: ActivationVariant
  is_high_value: boolean
  sms_channel_dead: boolean
  qr_scan_count: number
  stage: ActivationStage
  stage_changed_at: string | null
  created_at: string
  updated_at: string
}

/** Location fields joined for outbound sends — never includes consult_short_code. */
export type ActivationSendContext = {
  locationId: string
  shopName: string
  ownerEmail: string | null
  ownerName: string | null
  frontDeskPhone: string | null
  serviceWriterEmail: string | null
  serviceWriterName: string | null
  toolboxCasePartner: string | null
}

export type ActivationStateView = ActivationStateRow & ActivationSendContext

/** @deprecated Use ActivationStateView */
export type ActivationShopContext = ActivationStateView

export type InternalFollowUpReason =
  | 'never-activated-high-value'
  | 'dormant-high-value'
  | 'bad-frontdesk-number'

export type WriteConsultFactsResult = {
  locationId: string
  consultId: string
  consultCount: number
  firstConsultAt: string | null
  lastConsultAt: string
}

export type ActivationStageFacts = Pick<
  ActivationStateRow,
  | 'signed_up_at'
  | 'first_inbound_at'
  | 'first_consult_at'
  | 'last_consult_at'
  | 'consult_count'
>

export type RecomputeStageResult = {
  locationId: string
  enrollmentId?: string | null
  previousStage: ActivationStage
  stage: ActivationStage
  changed: boolean
}

export type LogShopEventResult = {
  inserted: boolean
}

export type DripDoneReason = 'first_inbound' | 'disabled'

export type DripStep =
  | 'welcome_email'
  | 'service_writer_setup_email'
  | 'nudge_1'
  | 'owner_gap_email'
  | 'nudge_2'
  | 'call_request'
  | 'internal_high_value'

export type InboundSmsTriggerPayload = {
  locationId: string
  messageId: string
  body?: string | null
  caseId?: string | null
  fromPhone?: string | null
  shopName?: string | null
  /** When true, notify experts that a new open case was created from this inbound. */
  notifyOpen?: boolean
}

export type ConsultCompletedTriggerPayload = {
  locationId: string
  consultId: string
  closedAt: string
  amountLabel?: string
  amountCents?: number
  paid?: boolean
}

export type DormancyCheckTriggerPayload = {
  locationId: string
  consultId: string
  anchorClosedAt?: string
  /** @deprecated Use anchorClosedAt */
  anchorConsultClosedAt?: string
}

export type HandleCallRequestTaskPayload = {
  locationId: string
  phoneNumber: string
  caseId?: string | null
  messageId?: string | null
}

/** @alias HandleCallRequestTaskPayload */
export type HandleCallRequestTriggerPayload = HandleCallRequestTaskPayload

export type StageChangedTaskPayload = {
  locationId: string
  enrollmentId: string | null
  previousStage: string
  stage: string
}

/** @alias StageChangedTaskPayload */
export type StageChangedTriggerPayload = StageChangedTaskPayload

/** @alias ConsultCompletedTriggerPayload */
export type ConsultCompletedTaskPayload = ConsultCompletedTriggerPayload

/** @alias DormancyCheckTriggerPayload */
export type DormancyCheckTaskPayload = DormancyCheckTriggerPayload

/** @alias InboundSmsTriggerPayload */
export type InboundSmsTaskPayload = InboundSmsTriggerPayload

export type InternalFollowUpTaskPayload = {
  locationId: string
  reason: 'never-activated-high-value' | 'dormant-high-value' | 'bad-frontdesk-number'
  shopName?: string | null
}
