import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { upsertLocationShopContact } from '@/lib/contact-sync'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
const SHOP_TYPES = new Set(['generalist', 'specialist'])

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
  'shop_type',
  'high_priority_target',
  'website',
  'standard_labor_rate',
  'warranty_labor_rate',
  'note',
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
  const hasNewAccountPayload = Boolean(newAccountPayload && typeof newAccountPayload === 'object')
  const newAccountBusinessNameRaw =
    newAccountPayload && typeof newAccountPayload === 'object'
      ? typeof newAccountPayload.business_name === 'string'
        ? newAccountPayload.business_name
        : typeof newAccountPayload.name === 'string'
          ? newAccountPayload.name
          : ''
      : ''
  const newAccountBusinessName = newAccountBusinessNameRaw.trim()
  const newAccountPrimaryName =
    newAccountPayload && typeof newAccountPayload === 'object' && typeof newAccountPayload.primary_contact_name === 'string'
      ? newAccountPayload.primary_contact_name.trim()
      : ''
  const newAccountEmail =
    newAccountPayload && typeof newAccountPayload === 'object' && typeof newAccountPayload.email === 'string'
      ? newAccountPayload.email.trim()
      : ''
  const newAccountPhone =
    newAccountPayload && typeof newAccountPayload === 'object' && typeof newAccountPayload.phone === 'string'
      ? newAccountPayload.phone.trim()
      : ''
  const hasNewAccount = hasNewAccountPayload && newAccountBusinessName.length > 0

  if (!fields.account_id && !hasNewAccount) {
    return NextResponse.json(
      { error: 'Select an existing account or fill in new account details.' },
      { status: 400 },
    )
  }
  if (hasNewAccountPayload && !newAccountBusinessName) {
    return NextResponse.json({ error: 'Business / account name is required.' }, { status: 400 })
  }

  if (!fields.chain_name) {
    fields.chain_name = detectChain(String(fields.name ?? '')) ?? null
  }

  fields.assigned_to = normalizeBdrAssignedTo(
    typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
  )

  if ('shop_type' in fields) {
    const st = fields.shop_type
    if (st === null || st === '') {
      fields.shop_type = null
    } else if (typeof st !== 'string' || !SHOP_TYPES.has(st)) {
      return NextResponse.json({ error: 'Invalid shop type' }, { status: 400 })
    }
  }

  if ('high_priority_target' in fields) {
    fields.high_priority_target = Boolean(fields.high_priority_target)
  }

  if ('website' in fields && typeof fields.website === 'string') {
    const w = fields.website.trim()
    fields.website = w === '' ? null : w
  }

  for (const rateKey of ['standard_labor_rate', 'warranty_labor_rate'] as const) {
    if (rateKey in fields) {
      const raw = fields[rateKey]
      if (raw === null || raw === '') {
        fields[rateKey] = null
      } else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `Invalid ${rateKey}` }, { status: 400 })
        }
        fields[rateKey] = n
      }
    }
  }

  if ('note' in fields) {
    const trimmed = typeof fields.note === 'string' ? fields.note.trim() : ''
    fields.note = trimmed === '' ? null : trimmed
  }

  if ('postal_code' in fields) {
    fields.postal_code = normalizePostalCode(fields.postal_code)
    const postalCodeError = getPostalCodeError(fields.postal_code)
    if (postalCodeError) {
      return NextResponse.json({ error: postalCodeError }, { status: 400 })
    }
  }

  if (fields.postal_code || fields.city) {
    const coords = await geocodeAddress(fields as { address_line1?: string; city?: string; state?: string; postal_code?: string })
    if (coords) {
      fields.lat = coords.lat
      fields.lng = coords.lng
      fields.geocoded_at = new Date().toISOString()
      fields.county = coords.county
      if (coords.state && stateFieldIsEmpty(fields.state as string | undefined)) {
        fields.state = coords.state
      }
    }
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .insert(fields)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const accountId = location.account_id as string
  let resolvedAccountId = accountId

  const pcName = typeof primary_contact_name === 'string' ? primary_contact_name.trim() : ''
  const pcEmail = typeof primary_contact_email === 'string' ? primary_contact_email.trim() : ''
  const pcPhone = typeof primary_contact_phone === 'string' ? primary_contact_phone.trim() : ''

  if (hasNewAccount) {
    const contactName = newAccountPrimaryName || pcName
    const contactEmail = newAccountEmail || pcEmail
    const contactPhone = newAccountPhone || pcPhone
    if (!contactName) {
      return NextResponse.json({ error: 'Primary contact name is required for a new account.' }, { status: 400 })
    }

    const { data: createdContact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .insert({
        account_id: null,
        location_id: location.id,
        name: contactName,
        email: contactEmail || null,
        phone: contactPhone || null,
        role: 'owner',
        is_primary: false,
      })
      .select('id')
      .single()
    if (contactErr) return NextResponse.json({ error: contactErr.message }, { status: 500 })

    const { data: createdAccount, error: accErr } = await supabaseAdmin
      .from('accounts')
      .insert({ business_name: newAccountBusinessName })
      .select('id')
      .single()
    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })

    resolvedAccountId = createdAccount.id

    const { error: locationAccountErr } = await supabaseAdmin
      .from('locations')
      .update({ account_id: resolvedAccountId })
      .eq('id', location.id)
    if (locationAccountErr) return NextResponse.json({ error: locationAccountErr.message }, { status: 500 })

    const { error: contactAccountErr } = await supabaseAdmin
      .from('contacts')
      .update({ account_id: resolvedAccountId, is_primary: true })
      .eq('id', createdContact.id)
    if (contactAccountErr) return NextResponse.json({ error: contactAccountErr.message }, { status: 500 })
  } else if (pcName || pcEmail || pcPhone) {
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

  return NextResponse.json({
    ...location,
    account_id: resolvedAccountId ?? location.account_id ?? null,
  })
}
