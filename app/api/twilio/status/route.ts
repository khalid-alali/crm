import { NextRequest, NextResponse } from 'next/server'
import { handleTwilioMessageStatus } from '@/lib/expert-assist/status-callback'
import { verifyTwilioRequest } from '@/lib/expert-assist/twilio-webhook'

export const runtime = 'nodejs'

function formDataToRecord(form: FormData): Record<string, string> {
  const o: Record<string, string> = {}
  form.forEach((v, k) => {
    if (typeof v === 'string') o[k] = v
  })
  return o
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-Twilio-Signature') ?? undefined
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }
  const params = formDataToRecord(form)

  const url =
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?
      `${process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/twilio/status`
    : req.nextUrl.toString()

  if (!verifyTwilioRequest(signature, url, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  await handleTwilioMessageStatus({
    messageSid: params['MessageSid'],
    twilioStatus: params['MessageStatus'],
  })

  return new NextResponse(null, { status: 204 })
}
