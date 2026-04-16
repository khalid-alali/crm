import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { revalidatePath } from 'next/cache'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    programStatuses,
    lat: _lat,
    lng: _lng,
    geocoded_at: _geocodedAt,
    motherduck_shop_id: incomingAdminShopId,
    ...rawFields
  } = body as Record<string, unknown>

  if (incomingAdminShopId !== undefined) {
    return NextResponse.json(
      { error: 'Use /api/locations/[id]/admin-shop-id to manage admin shop id links.' },
      { status: 400 },
    )
  }
  const allowedLocationFields = [
    'name',
    'chain_name',
    'owner_id',
    'address_line1',
    'city',
    'state',
    'postal_code',
    'primary_contact_name',
    'primary_contact_email',
    'primary_contact_phone',
    'status',
    'assigned_to',
    'source',
    'notes',
  ] as const
  const fields: Record<string, unknown> = {}
  for (const key of allowedLocationFields) {
    if (key in rawFields) fields[key] = rawFields[key]
  }

  if ('assigned_to' in fields) {
    fields.assigned_to = normalizeBdrAssignedTo(
      typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
    )
  }

  // Only auto-detect chain if name changed and chain_name not set
  if (typeof fields.name === 'string' && fields.name && !fields.chain_name) {
    // Get current chain_name
    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('chain_name')
      .eq('id', id)
      .single()
    if (!existing?.chain_name) {
      fields.chain_name = detectChain(fields.name) ?? null
    }
  }

  // Geocode if address changed
  if ('address_line1' in fields || 'city' in fields || 'state' in fields || 'postal_code' in fields) {
    const { data: current } = await supabaseAdmin
      .from('locations')
      .select('address_line1, city, state, postal_code')
      .eq('id', id)
      .single()
    const merged = { ...current, ...fields }
    const coords = await geocodeAddress(merged)
    if (coords) {
      fields.lat = coords.lat
      fields.lng = coords.lng
      fields.geocoded_at = new Date().toISOString()
    }
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (programStatuses) {
    for (const [program, status] of Object.entries(programStatuses)) {
      await supabaseAdmin.from('program_enrollments').upsert({
        location_id: id,
        program,
        status,
      }, { onConflict: 'location_id,program' })
    }
  }

  revalidatePath('/shops')
  revalidatePath(`/shops/${id}`)
  revalidatePath('/home')

  return NextResponse.json(location)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin.from('locations').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
