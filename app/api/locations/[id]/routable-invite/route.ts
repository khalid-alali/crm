import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: location, error: locationError } = await supabaseAdmin
    .from('locations')
    .select('id, routable_id, routable_payment_method_count')
    .eq('id', id)
    .maybeSingle()
  if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const vendorId = cleanText(location.routable_id)
  if (!vendorId) {
    return NextResponse.json({ error: 'Routable ID is missing for this shop.' }, { status: 400 })
  }
  if (Number(location.routable_payment_method_count ?? 0) > 0) {
    return NextResponse.json({ error: 'Shop already has a linked payout method.' }, { status: 400 })
  }

  const apiKey = cleanText(process.env.ROUTABLE_API_KEY)
  const actingTeamMemberId = cleanText(process.env.ROUTABLE_TEAM_MEMBER_ID)
  if (!apiKey || !actingTeamMemberId) {
    return NextResponse.json(
      { error: 'Missing ROUTABLE_API_KEY or ROUTABLE_TEAM_MEMBER_ID.' },
      { status: 500 },
    )
  }

  const res = await fetch(`https://api.routable.com/v1/companies/${encodeURIComponent(vendorId)}/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      get_links: false,
      send_invite_email: true,
      acting_team_member: actingTeamMemberId,
      message: 'Please use the secure link below to connect or update your bank account for payouts',
    }),
  })

  const raw = await res.text().catch(() => '')
  console.info('[routable invite] response', { locationId: id, status: res.status, body: raw.slice(0, 1000) })

  if (!res.ok) {
    return NextResponse.json(
      {
        error: raw ? `Routable API failed (${res.status}): ${raw.slice(0, 300)}` : `Routable API failed (${res.status})`,
      },
      { status: 502 },
    )
  }

  const sentAt = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('locations')
    .update({ last_routable_link_sent_at: sentAt })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await supabaseAdmin.from('activity_log').insert({
    location_id: id,
    type: 'note',
    subject: 'Routable invite resent',
    body: 'Resent Routable payout-method invite email.',
    sent_by: session.user?.email ?? 'unknown',
  })

  return NextResponse.json({ ok: true, sent_at: sentAt })
}
