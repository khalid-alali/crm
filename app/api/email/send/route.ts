import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { firstNameLocalFromSessionUser, notificationsFrom } from '@/lib/resend-notifications'
import { htmlToPlainText } from '@/lib/email-html'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    locationId,
    to,
    subject,
    bodyHtml,
    body: bodyPlainLegacy,
    template,
    fromShopDetail,
  } = body as {
    locationId?: string
    to?: string
    subject?: string
    bodyHtml?: string
    body?: string
    template?: string
    fromShopDetail?: boolean
  }

  const htmlRaw = typeof bodyHtml === 'string' ? bodyHtml.trim() : ''
  const plainLegacy = typeof bodyPlainLegacy === 'string' ? bodyPlainLegacy.trim() : ''

  if (!locationId || !to || !subject) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const useHtml = htmlRaw.length > 0
  const plainForSend = useHtml ? htmlToPlainText(htmlRaw) : plainLegacy
  if (!plainForSend) {
    return NextResponse.json({ error: 'Missing email body' }, { status: 400 })
  }

  const replyTo = session.user?.email?.trim()
  if (!replyTo) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 400 })
  }

  const displayName = session.user?.name?.trim() || 'RepairWise'
  const fromLocal = firstNameLocalFromSessionUser(session.user ?? {})
  const from = notificationsFrom(displayName, fromLocal)

  const { error: sendError } = await resend.emails.send({
    from,
    to,
    replyTo,
    subject,
    ...(useHtml ? { html: htmlRaw, text: plainForSend } : { text: plainForSend }),
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  const activityBody =
    fromShopDetail && template === 'intro'
      ? `${plainForSend}\n\n— Sent from shop detail (Email)`
      : plainForSend

  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'email',
    subject,
    body: activityBody,
    to_email: to,
    sent_by: session.user?.email ?? 'unknown',
  })

  if (template === 'intro') {
    await supabaseAdmin
      .from('locations')
      .update({ status: 'contacted' })
      .eq('id', locationId)
      .eq('status', 'lead')
  } else if (template === 'onboarding') {
    await supabaseAdmin
      .from('locations')
      .update({ status: 'active' })
      .eq('id', locationId)
      .eq('status', 'contracted')
  }

  return NextResponse.json({ ok: true })
}
