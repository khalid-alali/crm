import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    programStatuses,
    newOwner,
    lat: _lat,
    lng: _lng,
    geocoded_at: _geocodedAt,
    motherduck_shop_id: incomingAdminShopId,
    ...fields
  } = body

  if (incomingAdminShopId !== undefined) {
    return NextResponse.json(
      { error: 'Use the admin-shop-id endpoint after creating the shop.' },
      { status: 400 },
    )
  }

  const newOwnerName =
    newOwner && typeof newOwner === 'object' && typeof newOwner.name === 'string'
      ? newOwner.name.trim()
      : ''
  if (newOwnerName) {
    const { data: createdOwner, error: ownerErr } = await supabaseAdmin
      .from('owners')
      .insert({
        name: newOwnerName,
        email: typeof newOwner.email === 'string' && newOwner.email.trim() ? newOwner.email.trim() : null,
        phone: typeof newOwner.phone === 'string' && newOwner.phone.trim() ? newOwner.phone.trim() : null,
        title: typeof newOwner.title === 'string' && newOwner.title.trim() ? newOwner.title.trim() : null,
      })
      .select()
      .single()
    if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 })
    fields.owner_id = createdOwner.id
  }

  if (!fields.owner_id) {
    return NextResponse.json(
      { error: 'Select an existing owner or fill in new owner details.' },
      { status: 400 }
    )
  }

  if (!fields.chain_name) {
    fields.chain_name = detectChain(fields.name) ?? null
  }

  fields.assigned_to = normalizeBdrAssignedTo(
    typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
  )

  // Geocode if address present
  if (fields.postal_code || fields.city) {
    const coords = await geocodeAddress(fields)
    if (coords) {
      fields.lat = coords.lat
      fields.lng = coords.lng
      fields.geocoded_at = new Date().toISOString()
    }
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .insert(fields)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: logError } = await supabaseAdmin.from('activity_log').insert({
    location_id: location.id,
    type: 'shop_created',
    subject: 'Shop created',
    sent_by: session.user?.email ?? 'unknown',
  })
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  // Upsert program enrollments
  if (programStatuses) {
    for (const [program, status] of Object.entries(programStatuses)) {
      if (status !== 'not_enrolled') {
        await supabaseAdmin.from('program_enrollments').upsert({
          location_id: location.id,
          program,
          status,
        }, { onConflict: 'location_id,program' })
      }
    }
  }

  return NextResponse.json(location)
}
