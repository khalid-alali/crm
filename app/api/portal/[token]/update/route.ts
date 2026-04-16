import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let locationId: string
  try {
    const payload = verifyPortalToken(params.token)
    locationId = payload.locationId
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const body = await req.json()
  const { address_line1, city, state, postal_code, primary_contact_name, primary_contact_email, primary_contact_phone } = body

  const coords = await geocodeAddress({ address_line1, city, state, postal_code })

  const update: Record<string, any> = {
    address_line1, city, state, postal_code,
    primary_contact_name, primary_contact_email, primary_contact_phone,
  }
  if (coords) {
    update.lat = coords.lat
    update.lng = coords.lng
    update.geocoded_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('locations')
    .update(update)
    .eq('id', locationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'address_update',
    body: `Portal update: ${[address_line1, city, state, postal_code].filter(Boolean).join(', ')}`,
    sent_by: 'portal',
  })

  return NextResponse.json({ ok: true })
}
