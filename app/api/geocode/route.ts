import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'

export async function POST() {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Phase 1: locations missing either coordinate that have a street address
  const { data: missingCoords } = await supabaseAdmin
    .from('locations')
    .select('id, address_line1, city, state, postal_code')
    .not('address_line1', 'is', null)
    .or('lat.is.null,lng.is.null')

  let geocoded = 0
  let stateBackfilled = 0
  for (const loc of missingCoords ?? []) {
    const coords = await geocodeAddress({
      address_line1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      postal_code: loc.postal_code,
    })
    if (coords) {
      const row: Record<string, unknown> = {
        lat: coords.lat,
        lng: coords.lng,
        geocoded_at: new Date().toISOString(),
        county: coords.county,
      }
      if (coords.state && stateFieldIsEmpty(loc.state)) {
        row.state = coords.state
      }
      const { error } = await supabaseAdmin.from('locations').update(row).eq('id', loc.id)
      if (!error) {
        geocoded++
        if (row.state != null) stateBackfilled++
      }
    }
  }

  // Phase 2: already geocoded but county not stored (backfill)
  const { data: missingCounty } = await supabaseAdmin
    .from('locations')
    .select('id, address_line1, city, state, postal_code')
    .not('address_line1', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .is('county', null)

  let countyBackfilled = 0
  for (const loc of missingCounty ?? []) {
    const coords = await geocodeAddress({
      address_line1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      postal_code: loc.postal_code,
    })
    if (coords) {
      const row: Record<string, unknown> = {
        lat: coords.lat,
        lng: coords.lng,
        geocoded_at: new Date().toISOString(),
        county: coords.county,
      }
      if (coords.state && stateFieldIsEmpty(loc.state)) {
        row.state = coords.state
      }
      const { error } = await supabaseAdmin.from('locations').update(row).eq('id', loc.id)
      if (!error) {
        countyBackfilled++
        if (row.state != null) stateBackfilled++
      }
    }
  }

  return NextResponse.json({
    geocoded,
    total: missingCoords?.length ?? 0,
    countyBackfilled,
    countyBackfillCandidates: missingCounty?.length ?? 0,
    stateBackfilled,
  })
}
