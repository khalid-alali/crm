import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { htmlToPlainText } from '@/lib/email-html'
import { SEED_ONBOARDING_TEMPLATE_ID } from '@/lib/email-template-ids'
import { injectCapabilitiesIntoEmail } from '@/lib/inject-capabilities-email'

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
    fromShopDetail,
    emailTemplateId: emailTemplateIdRaw,
    template,
  } = body as {
    locationId?: string
    to?: string
    subject?: string
    bodyHtml?: string
    body?: string
    template?: string
    fromShopDetail?: boolean
    emailTemplateId?: string | null
  }

  const emailTemplateId =
    typeof emailTemplateIdRaw === 'string' && emailTemplateIdRaw.trim()
      ? emailTemplateIdRaw.trim()
      : null

  const htmlRaw = typeof bodyHtml === 'string' ? bodyHtml.trim() : ''
  const plainLegacy = typeof bodyPlainLegacy === 'string' ? bodyPlainLegacy.trim() : ''

  if (!locationId || !to || !subject) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const useHtml = htmlRaw.length > 0
  let subjectOut = typeof subject === 'string' ? subject.trim() : ''
  let bodyOut = htmlRaw

  if (useHtml) {
    try {
      const injected = injectCapabilitiesIntoEmail(req, locationId, subjectOut, bodyOut)
      subjectOut = injected.subject
      bodyOut = injected.bodyHtml
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not build portal link'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const plainForSend = useHtml ? htmlToPlainText(bodyOut) : plainLegacy
  if (!plainForSend) {
    return NextResponse.json({ error: 'Missing email body' }, { status: 400 })
  }

  const sessionEmail = session.user?.email?.trim()
  if (!sessionEmail) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 400 })
  }

  const replyTo = sessionEmail.replace(/@repairwise\.pro$/i, '@fixlane.com')
  if (!replyTo) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 400 })
  }

  const from = 'khalid@notifications.fixlane.com'

  const { error: sendError } = await resend.emails.send({
    from,
    to,
    replyTo,
    subject: subjectOut,
    ...(useHtml ? { html: bodyOut, text: plainForSend } : { text: plainForSend }),
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  const activityBody = fromShopDetail
    ? `${plainForSend}\n\n— Sent from shop detail (Email)`
    : plainForSend

  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'email',
    subject: subjectOut,
    body: activityBody,
    to_email: to,
    sent_by: session.user?.email ?? 'unknown',
  })

  await supabaseAdmin
    .from('locations')
    .update({ status: 'contacted' })
    .eq('id', locationId)
    .eq('status', 'lead')

  if (emailTemplateId === SEED_ONBOARDING_TEMPLATE_ID) {
    await supabaseAdmin
      .from('locations')
      .update({ status: 'active' })
      .eq('id', locationId)
      .eq('status', 'contracted')
  } else if (template === 'onboarding') {
    // Legacy client payloads (e.g. older cached UI)
    await supabaseAdmin
      .from('locations')
      .update({ status: 'active' })
      .eq('id', locationId)
      .eq('status', 'contracted')
  }

  return NextResponse.json({ ok: true })
}
