import { NextRequest, NextResponse } from 'next/server'
import { recordReferralBooked, recordReferralSubmitted } from '@/lib/activation/ingest'

type ReferralWebhookBody = {
  casePartner?: string
  event?: string
  referralId?: string
}

function verifyToolboxWebhook(req: NextRequest): boolean {
  const expected = process.env.TOOLBOX_WEBHOOK_TOKEN?.trim()
  if (!expected) return process.env.NODE_ENV === 'development'
  const token = req.nextUrl.searchParams.get('token')?.trim()
  return token === expected
}

export async function POST(req: NextRequest) {
  if (!verifyToolboxWebhook(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ReferralWebhookBody
  try {
    body = (await req.json()) as ReferralWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const casePartner = body.casePartner?.trim()
  const referralId = body.referralId?.trim()
  const event = body.event?.trim().toLowerCase()

  if (!casePartner) {
    return NextResponse.json({ error: 'casePartner is required' }, { status: 400 })
  }
  if (!referralId) {
    return NextResponse.json({ error: 'referralId is required' }, { status: 400 })
  }
  if (!event || !['submitted', 'booked'].includes(event)) {
    return NextResponse.json({ error: 'event must be submitted or booked' }, { status: 400 })
  }

  try {
    const result =
      event === 'booked' ?
        await recordReferralBooked({ casePartner, referralId })
      : await recordReferralSubmitted({ casePartner, referralId })

    if (!result.ok) {
      return NextResponse.json({ error: result.reason ?? 'referral_failed' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, locationId: result.locationId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Referral webhook failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
