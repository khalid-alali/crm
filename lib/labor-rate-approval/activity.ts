import type { SupabaseClient } from '@supabase/supabase-js'
import type { LaborRateApprovalEvent } from '@/lib/labor-rate-approval/types'

export type LaborRateApprovalActivityPayload = {
  event: LaborRateApprovalEvent
  approval_id: string
  status: string
  charge_rate?: number
  actor_name?: string | null
  reason?: string | null
  reminder_day?: number
}

const EVENT_SUBJECTS: Record<LaborRateApprovalEvent, string> = {
  submitted: 'Labor rate submitted for approval',
  resubmitted: 'Labor rate resubmitted for approval',
  approved: 'Labor rate approved',
  changes_requested: 'Labor rate changes requested',
  escalated: 'Labor rate approval escalated',
  reminder_sent: 'Labor rate approval reminder sent',
  expired: 'Labor rate approval expired',
}

export async function logLaborRateApprovalEvent(
  supabase: SupabaseClient,
  locationId: string,
  payload: LaborRateApprovalActivityPayload,
  sentBy: string,
): Promise<void> {
  const subject = EVENT_SUBJECTS[payload.event] ?? 'Labor rate approval update'
  const { error } = await supabase.from('activity_log').insert({
    location_id: locationId,
    type: 'labor_rate_approval',
    subject,
    body: JSON.stringify(payload),
    sent_by: sentBy,
  })
  if (error) throw new Error(error.message)
}
