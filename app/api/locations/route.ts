import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { upsertLocationShopContact } from '@/lib/contact-sync'

const LOCATION_INSERT_KEYS = [
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
  'vf_onboarding_name',
  'vf_onboarding_status',
  'lat',
  'lng',
  'geocoded_at',
] as const

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    programStatuses,
    newOwner: _legacyNewOwner,
    newAccount,
    lat: _lat,
    lng: _lng,
    geocoded_at: _geocodedAt,
    motherduck_shop_id: incomingAdminShopId,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    ...rest
  } = body as Record<string, unknown>

  if (incomingAdminShopId !== undefined) {
    return NextResponse.json(
      { error: 'Use the admin-shop-id endpoint after creating the shop.' },
      { status: 400 },
    )
  }

  const fields: Record<string, unknown> = {}
  for (const key of LOCATION_INSERT_KEYS) {
    if (key in rest) fields[key] = rest[key]
  }

  if ('owner_id' in body && body.owner_id && !fields.account_id) {
    fields.account_id = body.owner_id
  }

  const newAccountPayload = (newAccount ?? _legacyNewOwner) as Record<string, unknown> | undefined
  const newOwnerName =
    newAccountPayload && typeof newAccountPayload === 'object' && typeof newAccountPayload.name === 'string'
      ? newAccountPayload.name.trim()
      : ''
  let createdFromNewOwner = false
  if (newOwnerName) {
    createdFromNewOwner = true
    const { data: createdAccount, error: accErr } = await supabaseAdmin
      .from('accounts')
      .insert({ business_name: newOwnerName })
      .select()
      .single()
    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })
    fields.account_id = createdAccount.id
  }

  if (!fields.account_id) {
    return NextResponse.json(
      { error: 'Select an existing account or fill in new account details.' },
      { status: 400 },
    )
  }

  if (!fields.chain_name) {
    fields.chain_name = detectChain(String(fields.name ?? '')) ?? null
  }

  fields.assigned_to = normalizeBdrAssignedTo(
    typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
  )

  if (fields.postal_code || fields.city) {
    const coords = await geocodeAddress(fields as { address_line1?: string; city?: string; state?: string; postal_code?: string })
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

  const accountId = location.account_id as string

  if (newOwnerName && newAccountPayload && typeof newAccountPayload === 'object') {
    const email =
      typeof newAccountPayload.email === 'string' && newAccountPayload.email.trim()
        ? newAccountPayload.email.trim()
        : null
    const phone =
      typeof newAccountPayload.phone === 'string' && newAccountPayload.phone.trim()
        ? newAccountPayload.phone.trim()
        : null
    await supabaseAdmin.from('contacts').insert({
      account_id: accountId,
      location_id: null,
      name: newOwnerName,
      email,
      phone,
      role: 'owner',
      is_primary: true,
    })
  }

  const pcName = typeof primary_contact_name === 'string' ? primary_contact_name : ''
  const pcEmail = typeof primary_contact_email === 'string' ? primary_contact_email : ''
  const pcPhone = typeof primary_contact_phone === 'string' ? primary_contact_phone : ''
  if (!createdFromNewOwner && (pcName.trim() || pcEmail.trim() || pcPhone.trim())) {
    await upsertLocationShopContact(supabaseAdmin, {
      locationId: location.id,
      accountId: accountId,
      name: pcName,
      email: pcEmail,
      phone: pcPhone,
    })
  }

  const { error: logError } = await supabaseAdmin.from('activity_log').insert({
    location_id: location.id,
    type: 'shop_created',
    subject: 'Shop created',
    sent_by: session.user?.email ?? 'unknown',
  })
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  if (programStatuses) {
    for (const [program, status] of Object.entries(programStatuses)) {
      if (status !== 'not_enrolled') {
        await supabaseAdmin.from('program_enrollments').upsert(
          {
            location_id: location.id,
            program,
            status,
          },
          { onConflict: 'location_id,program' },
        )
      }
    }
  }

  return NextResponse.json(location)
}
