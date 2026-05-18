import { supabaseAdmin } from '@/lib/supabase'
import { twilioStatusCallbackUrl } from '@/lib/expert-assist/constants'
import { resolveTwilioMmsMediaUrls } from '@/lib/expert-assist/mms-media-url'
import { getTwilioRestClient } from '@/lib/expert-assist/twilio-client'
import { resolveTwilioMessagingOpts } from '@/lib/expert-assist/twilio-messaging'

export type ConsultLogDirection = 'system' | 'outbound'

/** Signed URLs Twilio fetches when sending MMS (must be publicly reachable). */
const TWILIO_MMS_URL_TTL_SEC = 3600

export async function sendTwilioSmsWithoutLog(to: string, body: string): Promise<void> {
  const statusCb = twilioStatusCallbackUrl()
  await getTwilioRestClient().messages.create({
    to,
    body,
    statusCallback: statusCb || undefined,
    ...resolveTwilioMessagingOpts(),
  })
}

export async function sendConsultSms(params: {
  to: string
  body: string
  caseId: string
  logDirection: ConsultLogDirection
  fromNumber?: string | null
  /** Supabase Storage paths in consult-media bucket. */
  mediaPaths?: string[]
}): Promise<{ messageId: string; twilioSid: string | null }> {
  const statusCb = twilioStatusCallbackUrl()
  const opts = resolveTwilioMessagingOpts()
  const mediaPaths = params.mediaPaths ?? []
  const bodyText = params.body.trim()

  if (!bodyText && mediaPaths.length === 0) {
    throw new Error('Message must include text or an image')
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('consult_messages')
    .insert({
      case_id: params.caseId,
      direction: params.logDirection,
      body: bodyText || null,
      media_urls: mediaPaths,
      from_number: params.fromNumber ?? null,
      to_number: params.to,
      delivery_status: 'queued',
    })
    .select('id')
    .single()

  if (insErr || !inserted) throw new Error(insErr?.message ?? 'Failed to insert consult message')

  const messageId = inserted.id as string

  let twilioMediaUrls: string[] = []
  if (mediaPaths.length) {
    try {
      twilioMediaUrls = await resolveTwilioMmsMediaUrls(mediaPaths, TWILIO_MMS_URL_TTL_SEC)
    } catch (prepErr) {
      await supabaseAdmin.from('consult_messages').update({ delivery_status: 'failed' }).eq('id', messageId)
      throw prepErr
    }
  }

  try {
    const msg = await getTwilioRestClient().messages.create({
      to: params.to,
      body: bodyText || undefined,
      mediaUrl: twilioMediaUrls.length ? twilioMediaUrls : undefined,
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
