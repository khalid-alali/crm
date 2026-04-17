import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { upsertLocationShopContact } from '@/lib/contact-sync'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
import { revalidatePath } from 'next/cache'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const {
    programStatuses,
    lat: _lat,
    lng: _lng,
    geocoded_at: _geocodedAt,
    motherduck_shop_id: incomingAdminShopId,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    ...rawFields
  } = body

  if (incomingAdminShopId !== undefined) {
    return NextResponse.json(
      { error: 'Use /api/locations/[id]/admin-shop-id to manage admin shop id links.' },
      { status: 400 },
    )
  }
  const allowedLocationFields = [
    'name',
    'chain_name',
    'account_id',
    'address_line1',
    'city',
    'state',
    'postal_code',
    'status',
    'assigned_to',
    'source',
    'notes',
  ] as const
  const fields: Record<string, unknown> = {}
  for (const key of allowedLocationFields) {
    if (key in rawFields) fields[key] = rawFields[key]
  }

  if ('owner_id' in body && body.owner_id !== undefined && !('account_id' in fields)) {
    fields.account_id = body.owner_id
  }

  if ('assigned_to' in fields) {
    fields.assigned_to = normalizeBdrAssignedTo(
      typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
    )
  }

  if ('postal_code' in fields) {
    fields.postal_code = normalizePostalCode(fields.postal_code)
    const postalCodeError = getPostalCodeError(fields.postal_code)
    if (postalCodeError) {
      return NextResponse.json({ error: postalCodeError }, { status: 400 })
    }
  }

  if (typeof fields.name === 'string' && fields.name && !('chain_name' in fields)) {
    const { data: existing } = await supabaseAdmin.from('locations').select('chain_name').eq('id', id).single()
    if (!existing?.chain_name) {
      fields.chain_name = detectChain(fields.name) ?? null
    }
  }

  if ('address_line1' in fields || 'city' in fields || 'state' in fields || 'postal_code' in fields) {
    const { data: current } = await supabaseAdmin
      .from('locations')
      .select('address_line1, city, state, postal_code')
      .eq('id', id)
      .single()
    const merged = { ...current, ...fields }
    const coords = await geocodeAddress(merged as { address_line1?: string; city?: string; state?: string; postal_code?: string })
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

  const hasPrimaryUpdate =
    typeof primary_contact_name === 'string' ||
    typeof primary_contact_email === 'string' ||
    typeof primary_contact_phone === 'string'
  if (hasPrimaryUpdate && location.account_id) {
    await upsertLocationShopContact(supabaseAdmin, {
      locationId: id,
      accountId: location.account_id as string,
      name: typeof primary_contact_name === 'string' ? primary_contact_name : '',
      email: typeof primary_contact_email === 'string' ? primary_contact_email : '',
      phone: typeof primary_contact_phone === 'string' ? primary_contact_phone : '',
    })
  }

  if (programStatuses) {
    for (const [program, status] of Object.entries(programStatuses)) {
      await supabaseAdmin.from('program_enrollments').upsert(
        {
          location_id: id,
          program,
          status,
        },
        { onConflict: 'location_id,program' },
      )
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
