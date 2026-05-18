/** Labels and string unions for Expert Assist — keep in sync with migration checks. */

export const CONSULT_CASE_STATUSES = [
  'awaiting_shop_code',
  'awaiting_expert_approval',
  'open',
  'closed',
  'billing_failed',
  'cancelled',
] as const

export type ConsultCaseStatus = (typeof CONSULT_CASE_STATUSES)[number]

export const CONSULT_CASE_STATUS_LABELS: Record<ConsultCaseStatus, string> = {
  awaiting_shop_code: 'Awaiting shop code',
  awaiting_expert_approval: 'Pending approval',
  open: 'Open',
  closed: 'Closed',
  billing_failed: 'Billing failed',
  cancelled: 'Cancelled',
}

export const CONSULT_OUTCOMES_FILTER = [
  'resolved_on_call',
  'recommended_toolbox',
  'out_of_scope',
  'no_show',
  'cancelled',
] as const

export type ConsultOutcome = (typeof CONSULT_OUTCOMES_FILTER)[number]

export const CONSULT_OUTCOME_LABELS: Record<ConsultOutcome, string> = {
  resolved_on_call: 'Resolved on call',
  recommended_toolbox: 'Recommended Toolbox',
  out_of_scope: 'Out of scope',
  no_show: 'No show',
  cancelled: 'Cancelled',
}

export type ConsultQueueRow = {
  id: string
  status: ConsultCaseStatus
  created_at: string
  originating_phone_number: string
  initial_question: string | null
  shop_id: string | null
  vin: string | null
  year: string | null
  model: string | null
  trim: string | null
  timer_started_at: string | null
  timer_stopped_at: string | null
  billable_seconds: number | null
  delivery_attention?: boolean
  last_message_direction?: string | null
  last_message_at?: string | null
  /** First inbound SMS body (trimmed); queue Question column. */
  first_inbound_preview?: string | null
  shop?: { id: string; name: string } | null
  contact?: { display_name: string | null; phone_number: string; status: string } | null
}

export type ConsultMessageRow = {
  id: string
  case_id: string
  direction: 'inbound' | 'outbound' | 'system'
  body: string | null
  media_urls: string[]
  /** Signed HTTP URLs for display (set server-side when paths are storage keys). */
  media_display_urls?: string[]
  delivery_status: string
  created_at: string
}
