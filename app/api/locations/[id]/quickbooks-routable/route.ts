import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v : null
}

function composeLocationAddress(location: {
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}): string | null {
  const line1 = cleanText(location.address_line1)
  const cityState = [cleanText(location.city), cleanText(location.state)].filter(Boolean).join(', ')
  const zip = cleanText(location.postal_code)
  const parts = [line1, cityState, zip].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: location, error: locationError } = await supabaseAdmin
    .from('locations')
    .select('id, name, motherduck_shop_id, account_id, address_line1, city, state, postal_code')
    .eq('id', id)
    .maybeSingle()

  if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const motherduckShopId = cleanText(location.motherduck_shop_id)
  if (!motherduckShopId) {
    return NextResponse.json(
      { error: 'Admin shop is not linked. Link admin first (set motherduck_shop_id).' },
      { status: 400 },
    )
  }
  if (!UUID_RE.test(motherduckShopId)) {
    return NextResponse.json(
      { error: 'Admin shop link is invalid. Re-link the admin shop first.' },
      { status: 400 },
    )
  }

  const { data: cacheRow, error: cacheError } = await supabaseAdmin
    .from('shop_status_cache')
    .select('shop_id, shop_name, owner_name, owner_email, owner_phone, full_address, city, state, zip')
    .eq('shop_id', motherduckShopId)
    .maybeSingle()

  if (cacheError) return NextResponse.json({ error: cacheError.message }, { status: 500 })

  const resolvedPrimary = await resolvePrimaryContact(supabaseAdmin, location.account_id, location.id)

  const payload = {
    shop_name: cleanText(cacheRow?.shop_name) ?? cleanText(location.name) ?? '',
    shop_id: cleanText(cacheRow?.shop_id) ?? motherduckShopId,
    owner_name:
      cleanText(cacheRow?.owner_name) ??
      cleanText(resolvedPrimary?.name) ??
      cleanText(resolvedPrimary?.email) ??
      null,
    owner_email: cleanText(cacheRow?.owner_email),
    owner_phone: cleanText(cacheRow?.owner_phone) ?? cleanText(resolvedPrimary?.phone) ?? null,
    full_address: cleanText(cacheRow?.full_address) ?? composeLocationAddress(location),
    city: cleanText(cacheRow?.city) ?? cleanText(location.city),
    state: cleanText(cacheRow?.state) ?? cleanText(location.state),
    zip: cleanText(cacheRow?.zip) ?? cleanText(location.postal_code),
  }

  const webhookUrl =
    cleanText(process.env.ZAPIER_QB_ROUTABLE_WEBHOOK_URL) ??
    cleanText(process.env.ZAPIER_QUICKBOOKS_ROUTABLE_WEBHOOK_URL)

  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Zapier webhook is not configured (ZAPIER_QB_ROUTABLE_WEBHOOK_URL).' },
      { status: 500 },
    )
  }

  const upstreamRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!upstreamRes.ok) {
    const raw = await upstreamRes.text().catch(() => '')
    return NextResponse.json(
      {
        error: raw
          ? `Zapier webhook failed (${upstreamRes.status}): ${raw.slice(0, 300)}`
          : `Zapier webhook failed (${upstreamRes.status})`,
      },
      { status: 502 },
    )
  }

  await supabaseAdmin.from('activity_log').insert({
    location_id: id,
    type: 'routable_enrollment_initiated',
    subject: 'Routable enrollment initiated',
    body: 'Triggered Add shop to QuickBooks and Routable via Zapier webhook.',
    sent_by: session.user?.email ?? 'unknown',
  })

  return NextResponse.json({ ok: true })
}
