import { supabaseAdmin } from '@/lib/supabase'
import { twilioStatusCallbackUrl } from '@/lib/expert-assist/constants'
import { getTwilioRestClient } from '@/lib/expert-assist/twilio-client'

function messagingOpts(): { messagingServiceSid?: string; from?: string } {
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
  if (msid) return { messagingServiceSid: msid }
  const from = process.env.TWILIO_FROM_NUMBER?.trim()
  if (from) return { from }
  throw new Error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER')
}

export type ConsultLogDirection = 'system' | 'outbound'

export async function sendTwilioSmsWithoutLog(to: string, body: string): Promise<void> {
  const statusCb = twilioStatusCallbackUrl()
  await getTwilioRestClient().messages.create({
    to,
    body,
    statusCallback: statusCb || undefined,
    ...messagingOpts(),
  })
}

export async function sendConsultSms(params: {
  to: string
  body: string
  caseId: string
  logDirection: ConsultLogDirection
  fromNumber?: string | null
}): Promise<{ messageId: string; twilioSid: string | null }> {
  const statusCb = twilioStatusCallbackUrl()
  const opts = messagingOpts()

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('consult_messages')
    .insert({
      case_id: params.caseId,
      direction: params.logDirection,
      body: params.body,
      media_urls: [],
      from_number: params.fromNumber ?? null,
      to_number: params.to,
      delivery_status: 'queued',
    })
    .select('id')
    .single()

  if (insErr || !inserted) throw new Error(insErr?.message ?? 'Failed to insert consult message')

  const messageId = inserted.id as string

  try {
    const msg = await getTwilioRestClient().messages.create({
      to: params.to,
      body: params.body,
      statusCallback: statusCb || undefined,
      ...opts,
    })

    const { error: upErr } = await supabaseAdmin
      .from('consult_messages')
      .update({
        twilio_message_sid: msg.sid,
        delivery_status: msg.status === 'failed' ? 'failed' : 'sent',
      })
      .eq('id', messageId)

    if (upErr) console.error('sendConsultSms update sid', upErr.message)
    return { messageId, twilioSid: msg.sid }
  } catch (e) {
    await supabaseAdmin.from('consult_messages').update({ delivery_status: 'failed' }).eq('id', messageId)
    throw e
  }
}
