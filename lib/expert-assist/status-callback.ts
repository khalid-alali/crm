import { supabaseAdmin } from '@/lib/supabase'

const STATUS_MAP: Record<string, 'queued' | 'sent' | 'delivered' | 'failed' | null> = {
  queued: 'queued',
  accepted: 'sent',
  scheduled: 'sent',
  sending: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  undelivered: 'failed',
  failed: 'failed',
}

export async function handleTwilioMessageStatus(params: {
  messageSid: string | undefined
  twilioStatus: string | undefined
}): Promise<void> {
  const sid = params.messageSid?.trim()
  if (!sid) return

  const raw = (params.twilioStatus ?? '').toLowerCase()
  const mapped = STATUS_MAP[raw] ?? null
  if (!mapped) return

  const { data: row } = await supabaseAdmin
    .from('consult_messages')
    .select('id, case_id')
    .eq('twilio_message_sid', sid)
    .maybeSingle()

  if (row) {
    await supabaseAdmin.from('consult_messages').update({ delivery_status: mapped }).eq('id', row.id)

    if (mapped === 'failed' && row.case_id) {
      await supabaseAdmin.from('consult_cases').update({ delivery_attention: true }).eq('id', row.case_id)
    }
  }

}
