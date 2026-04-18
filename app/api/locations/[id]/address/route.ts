import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { address_line1, city, state } = body
  const postal_code = normalizePostalCode(body.postal_code)
  const postalCodeError = getPostalCodeError(postal_code)
  if (postalCodeError) {
    return NextResponse.json({ error: postalCodeError }, { status: 400 })
  }

  const coords = await geocodeAddress({ address_line1, city, state, postal_code })

  const update: Record<string, any> = { address_line1, city, state, postal_code }
  if (coords) {
    update.lat = coords.lat
    update.lng = coords.lng
    update.geocoded_at = new Date().toISOString()
    update.county = coords.county
    if (coords.state && stateFieldIsEmpty(state)) {
      update.state = coords.state
    }
  }

  const { error } = await supabaseAdmin
    .from('locations')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log address update
  await supabaseAdmin.from('activity_log').insert({
    location_id: id,
    type: 'address_update',
    body: `Address updated to: ${[address_line1, city, state, postal_code].filter(Boolean).join(', ')}`,
    sent_by: session.user?.email ?? 'unknown',
  })

  return NextResponse.json({
    lat: coords?.lat,
    lng: coords?.lng,
    county: coords?.county ?? null,
    state: coords?.state && stateFieldIsEmpty(state) ? coords.state : undefined,
  })
}
