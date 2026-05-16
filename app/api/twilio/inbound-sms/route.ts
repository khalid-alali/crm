import { NextRequest, NextResponse } from 'next/server'
import { handleInboundSms, twilioParamsFromFormData } from '@/lib/expert-assist/inbound-sms'
import { inboundSmsWebhookUrl, verifyTwilioRequest } from '@/lib/expert-assist/twilio-webhook'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-Twilio-Signature') ?? undefined

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const params = twilioParamsFromFormData(form)
  const url =
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?
      `${process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/twilio/inbound-sms`
    : req.nextUrl.toString()

  if (!verifyTwilioRequest(signature, url, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    await handleInboundSms(params)
  } catch (e) {
    console.error('handleInboundSms', e)
    return new NextResponse('Internal Error', { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
