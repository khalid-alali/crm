import { getState, setSmsChannelDead, writeFactIfNull } from '@/lib/activation/bindings'
import { triggerInternalFollowUp } from '@/lib/activation/trigger'
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

const FRONT_DESK_WELCOME_DEDUPE = 'drip:front_desk_sms'

async function resolveActivationFrontDeskSms(
  messageSid: string,
): Promise<{ locationId: string; isWelcomeSms: boolean } | null> {
  const { data, error } = await supabaseAdmin
    .from('shop_events')
    .select('location_id, dedupe_key')
    .eq('event_type', 'message.sent')
    .filter('payload->>twilio_message_sid', 'eq', messageSid)
    .maybeSingle()

  if (error) {
    console.error('resolveActivationFrontDeskSms', error.message)
    return null
  }
  if (!data) return null

  const row = data as { location_id: string; dedupe_key: string }
  return {
    locationId: row.location_id,
    isWelcomeSms: row.dedupe_key === FRONT_DESK_WELCOME_DEDUPE,
  }
}

async function handleActivationSmsDeliveryStatus(
  messageSid: string,
  twilioStatus: string,
): Promise<void> {
  const activation = await resolveActivationFrontDeskSms(messageSid)
  if (!activation) return

  const raw = twilioStatus.toLowerCase()
  if (raw === 'delivered') {
    try {
      await writeFactIfNull(
        activation.locationId,
        'front_desk_sms_delivered_at',
        new Date().toISOString(),
      )
    } catch (e) {
      console.error('handleActivationSmsDeliveryStatus delivered', e)
    }
    return
  }

  if ((raw === 'failed' || raw === 'undelivered') && activation.isWelcomeSms) {
    try {
      await setSmsChannelDead(activation.locationId, true)
      const state = await getState(activation.locationId)
      await triggerInternalFollowUp({
        locationId: activation.locationId,
        reason: 'bad-frontdesk-number',
        shopName: state?.shopName ?? null,
      })
    } catch (e) {
      console.error('handleActivationSmsDeliveryStatus failed welcome', e)
    }
  }
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

  if (raw === 'delivered' || raw === 'failed' || raw === 'undelivered') {
    await handleActivationSmsDeliveryStatus(sid, raw)
  }
}
