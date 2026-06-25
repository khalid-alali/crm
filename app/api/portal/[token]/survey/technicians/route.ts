import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { verifyCapabilitiesPortalToken, signTechSurveyToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import { portalBaseUrl } from '@/lib/portal-base-url'
import { notificationsFrom } from '@/lib/resend-notifications'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function locationIdFromToken(token: string): string | null {
  try {
    return verifyCapabilitiesPortalToken(token).locationId
  } catch {
    return null
  }
}

type InviteRow = {
  id: string
  email: string
  status: string
  sent_at: string | null
  completed_at: string | null
}

const ROSTER_COLS = 'id, email, status, sent_at, completed_at'

async function loadRoster(locationId: string): Promise<InviteRow[]> {
  const { data } = await supabaseAdmin
    .from('tech_survey_invites')
    .select(ROSTER_COLS)
    .eq('location_id', locationId)
    .order('created_at', { ascending: true })
  return (data as InviteRow[] | null) ?? []
}

/** Send a tech their survey invite email. Throws on Resend error so callers can catch per-invite. */
async function sendInviteEmail(to: string, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    console.warn('tech survey invite: no RESEND_API_KEY, skipping send for', to)
    return
  }
  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from: notificationsFrom('RepairWise', 'onboarding'),
    to,
    subject: 'Complete your VinFast technician readiness survey',
    html: [
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#0f1114;line-height:1.5">`,
      `<p>Your shop was invited to RepairWise's VinFast program and has added you as a technician.</p>`,
      `<p>Please take about 5 minutes to complete a short readiness survey so we know your background and skills.</p>`,
      `<p style="margin:24px 0">`,
      `<a href="${link}" style="display:inline-block;background:#687cf9;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Start the survey</a>`,
      `</p>`,
      `<p style="font-size:13px;color:#5f6571">Or paste this link into your browser:<br>${link}</p>`,
      `<p>— RepairWise</p>`,
      `</div>`,
    ].join(''),
  })
  if (error) throw new Error(error.message)
}

// GET — the current invite roster for this location.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const invites = await loadRoster(locationId)
  return NextResponse.json({ invites })
}

type PostBody = { emails?: string[] }

// POST — add new tech invites (idempotent per location+lower(email)) and email them.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Normalize, lowercase, trim, validate, dedupe within the request.
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const raw of body.emails ?? []) {
    if (typeof raw !== 'string') continue
    const email = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) continue
    if (seen.has(email)) continue
    seen.add(email)
    candidates.push(email)
  }

  if (candidates.length > 0) {
    // Skip emails already present (unique on location_id + lower(email)).
    const { data: existing } = await supabaseAdmin
      .from('tech_survey_invites')
      .select('email')
      .eq('location_id', locationId)
    const existingSet = new Set(
      ((existing as { email: string }[] | null) ?? []).map(e => e.email.trim().toLowerCase()),
    )
    const toCreate = candidates.filter(e => !existingSet.has(e))

    for (const email of toCreate) {
      const { data: invite, error } = await supabaseAdmin
        .from('tech_survey_invites')
        .insert({ location_id: locationId, email, status: 'invited' })
        .select('id')
        .single()
      if (error || !invite) {
        console.warn('tech survey invite: insert failed for', email, error?.message)
        continue
      }
      const inviteId = (invite as { id: string }).id
      try {
        const techToken = signTechSurveyToken(inviteId)
        const link = `${portalBaseUrl(req)}/survey/tech/${techToken}`
        await sendInviteEmail(email, link)
        await supabaseAdmin
          .from('tech_survey_invites')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', inviteId)
          .eq('location_id', locationId)
      } catch (e) {
        // Email send failure must not fail the whole request; leave invite as 'invited'.
        console.warn('tech survey invite: email send failed for', email, (e as Error)?.message)
      }
    }
  }

  const invites = await loadRoster(locationId)
  return NextResponse.json({ invites })
}

type PatchBody = { inviteId?: string; action?: string }

// PATCH — resend an existing invite's email.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'resend') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }
  const inviteId = body.inviteId
  if (!inviteId || !UUID_RE.test(inviteId)) {
    return NextResponse.json({ error: 'Invalid invite id' }, { status: 400 })
  }

  const { data: invite } = await supabaseAdmin
    .from('tech_survey_invites')
    .select('id, location_id, email')
    .eq('id', inviteId)
    .maybeSingle()

  const row = invite as { id: string; location_id: string; email: string } | null
  if (!row || row.location_id !== locationId) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  try {
    const techToken = signTechSurveyToken(row.id)
    const link = `${portalBaseUrl(req)}/survey/tech/${techToken}`
    await sendInviteEmail(row.email, link)
    await supabaseAdmin
      .from('tech_survey_invites')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('location_id', locationId)
  } catch (e) {
    console.warn('tech survey invite: resend failed for', row.email, (e as Error)?.message)
  }

  return NextResponse.json({ ok: true })
}
