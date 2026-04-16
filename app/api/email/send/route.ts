import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { firstNameLocalFromSessionUser, notificationsFrom } from '@/lib/resend-notifications'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { locationId, to, subject, body, template, fromShopDetail } = await req.json()

  if (!locationId || !to || !subject || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
    reply_to: replyTo,
    subject,
    text: body,
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  const activityBody =
    fromShopDetail && template === 'intro'
      ? `${body}\n\n— Sent from shop detail (Send intro email)`
      : body

  // Log to activity_log
  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'email',
    subject,
    body: activityBody,
    to_email: to,
    sent_by: session.user?.email ?? 'unknown',
  })

  // Auto-advance status
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
