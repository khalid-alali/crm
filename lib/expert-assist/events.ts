import { supabaseAdmin } from '@/lib/supabase'

export type ConsultAuditEventType =
  | 'created'
  | 'shop_linked'
  | 'contact_pending'
  | 'contact_approved'
  | 'timer_started'
  | 'timer_stopped'
  | 'outcome_set'
  | 'closed'
  | 'charged'
  | 'charge_failed'
  | 'note_added'

export async function insertConsultCaseEvent(params: {
  caseId: string
  eventType: ConsultAuditEventType
  actorType: 'system' | 'expert' | 'shop'
  actorId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabaseAdmin.from('consult_case_events').insert({
    case_id: params.caseId,
    event_type: params.eventType,
    actor_type: params.actorType,
    actor_id: params.actorId ?? null,
    metadata: params.metadata ?? {},
  })
  if (error) console.error('insertConsultCaseEvent', error.message)
}
