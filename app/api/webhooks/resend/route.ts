import { NextRequest, NextResponse } from 'next/server'
import { recordOwnerForwardClick } from '@/lib/activation/ingest'
import { crmPublicBaseUrl } from '@/lib/expert-assist/slack'

type ResendWebhookBody = {
  type?: string
  created_at?: string
  data?: {
    click?: { link?: string; timestamp?: string }
    email_id?: string
    to?: string[]
    tags?: Record<string, string>
  }
}

function verifyResendWebhook(req: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === 'development'

  const header = req.headers.get('svix-signature') ?? req.headers.get('resend-signature')
  if (!header) return false
  // Resend uses Svix — full verification requires raw body + svix library.
  // Gate on shared secret header when operators set RESEND_WEBHOOK_SECRET as Bearer token.
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  return bearer === secret
}

function parseLocationIdFromForwardUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const base = crmPublicBaseUrl().replace(/\/$/, '')
    if (!parsed.href.startsWith(`${base}/api/expert-assist/activation/forward-click`)) {
      return null
    }
    return parsed.searchParams.get('locationId')?.trim() ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!verifyResendWebhook(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ResendWebhookBody
  try {
    body = (await req.json()) as ResendWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.type !== 'email.clicked') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const link = body.data?.click?.link?.trim()
  if (!link) return NextResponse.json({ ok: true, ignored: true })

  const locationId = parseLocationIdFromForwardUrl(link)
  if (!locationId) return NextResponse.json({ ok: true, ignored: true })

  const dedupeKey =
    body.data?.email_id?.trim() ?
      `resend-click:${body.data.email_id}`
    : `resend-click:${body.created_at ?? 'unknown'}`

  try {
    await recordOwnerForwardClick(locationId, dedupeKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record click'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
