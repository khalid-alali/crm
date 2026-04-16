import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Batch geocode locations missing either coordinate that have a street address
  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, address_line1, city, state, postal_code')
    .not('address_line1', 'is', null)
    .or('lat.is.null,lng.is.null')

  if (!locations?.length) return NextResponse.json({ geocoded: 0, total: 0 })

  let count = 0
  for (const loc of locations) {
    const coords = await geocodeAddress({
      address_line1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      postal_code: loc.postal_code,
    })
    if (coords) {
      const { error } = await supabaseAdmin
        .from('locations')
        .update({ lat: coords.lat, lng: coords.lng, geocoded_at: new Date().toISOString() })
        .eq('id', loc.id)
      if (!error) count++
    }
  }

  return NextResponse.json({ geocoded: count, total: locations.length })
}
