import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { upsertLocationShopContact } from '@/lib/contact-sync'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let locationId: string
  try {
    const payload = verifyPortalToken(token)
    locationId = payload.locationId
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const body = await req.json()
  const { address_line1, city, state, postal_code, primary_contact_name, primary_contact_email, primary_contact_phone } = body

  const coords = await geocodeAddress({ address_line1, city, state, postal_code })

  const update: Record<string, unknown> = {
    address_line1,
    city,
    state,
    postal_code,
  }
  if (coords) {
    update.lat = coords.lat
    update.lng = coords.lng
    update.geocoded_at = new Date().toISOString()
    update.county = coords.county
    if (coords.state && stateFieldIsEmpty(state)) {
      update.state = coords.state
    }
  }

  const { error } = await supabaseAdmin.from('locations').update(update).eq('id', locationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: loc } = await supabaseAdmin.from('locations').select('account_id').eq('id', locationId).single()
  if (loc?.account_id) {
    await upsertLocationShopContact(supabaseAdmin, {
      locationId,
      accountId: loc.account_id,
      name: primary_contact_name,
      email: primary_contact_email,
      phone: primary_contact_phone,
    })
  }

  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'address_update',
    body: `Portal update: ${[address_line1, city, state, postal_code].filter(Boolean).join(', ')}`,
    sent_by: 'portal',
  })

  return NextResponse.json({ ok: true })
}
