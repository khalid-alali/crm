export const LABOR_RATE_APPROVAL_STATUSES = [
  'requested',
  'approved',
  'changes_requested',
  'escalated',
  'expired',
] as const

export type LaborRateApprovalStatus = (typeof LABOR_RATE_APPROVAL_STATUSES)[number]

export type LaborRateApprovalRow = {
  id: string
  location_id: string
  warranty_rate: number
  charge_rate: number
  status: LaborRateApprovalStatus
  submitted_by_email: string | null
  submitted_at: string
  sla_due_at: string
  decided_at: string | null
  decided_by_name: string | null
  decision_reason: string | null
  escalated_at: string | null
  decision_token: string
  token_used_at: string | null
  email_thread_message_id: string | null
  created_at: string
  updated_at: string
}

export type LaborRateApprovalEvent =
  | 'submitted'
  | 'resubmitted'
  | 'approved'
  | 'changes_requested'
  | 'escalated'
  | 'reminder_sent'
  | 'expired'
