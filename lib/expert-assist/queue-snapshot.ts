import type { ConsultQueueRow } from '@/lib/expert-assist/types'

/** Stable signature for poll diffing — skip React updates when nothing material changed. */
export function queueDataSignature(pending: ConsultQueueRow[], open: ConsultQueueRow[]): string {
  const row = (r: ConsultQueueRow) =>
    [
      r.id,
      r.status,
      r.created_at,
      r.last_message_at ?? '',
      r.last_message_direction ?? '',
      r.first_inbound_preview ?? '',
      r.initial_question ?? '',
      r.timer_started_at ?? '',
      r.timer_stopped_at ?? '',
      r.delivery_attention ? '1' : '0',
      r.shop?.name ?? '',
      r.model ?? '',
      r.year ?? '',
    ].join('|')

  return `p:${pending.map(row).join(';')}\no:${open.map(row).join(';')}`
}
