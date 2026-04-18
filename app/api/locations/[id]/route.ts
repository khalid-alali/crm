import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { upsertLocationShopContact } from '@/lib/contact-sync'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
import { revalidatePath } from 'next/cache'
import { parseDisqualifiedReason } from '@/lib/location-outcome-reasons'

const SHOP_TYPES = new Set(['generalist', 'specialist'])

function parseNullableNumber(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return n
}

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

  const { data: existingRow, error: existingErr } = await supabaseAdmin
    .from('locations')
    .select(
      'status, disqualified_reason, disqualified_at, address_line1, city, state, postal_code, chain_name',
    )
    .eq('id', id)
    .single()

  if (existingErr || !existingRow) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const prevStatus = String(existingRow.status ?? '')
  const prevDisqualifiedReason =
    existingRow.disqualified_reason == null ? null : String(existingRow.disqualified_reason)

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
    'shop_type',
    'high_priority_target',
    'website',
    'standard_labor_rate',
    'warranty_labor_rate',
    'note',
  ] as const

  const fields: Record<string, unknown> = {}
  for (const key of allowedLocationFields) {
    if (key in rawFields) fields[key] = rawFields[key]
  }

  if ('owner_id' in body && body.owner_id !== undefined && !('account_id' in fields)) {
    fields.account_id = body.owner_id
  }

  if ('shop_type' in fields) {
    const st = fields.shop_type
    if (st === null || st === '') {
      fields.shop_type = null
    } else if (typeof st === 'string' && SHOP_TYPES.has(st)) {
      fields.shop_type = st
    } else {
      return NextResponse.json({ error: 'Invalid shop type' }, { status: 400 })
    }
  }

  if ('high_priority_target' in fields) {
    fields.high_priority_target = Boolean(fields.high_priority_target)
  }

  if ('website' in fields) {
    const w = typeof fields.website === 'string' ? fields.website.trim() : ''
    fields.website = w === '' ? null : w
  }

  if ('note' in fields) {
    const n = typeof fields.note === 'string' ? fields.note : fields.note == null ? '' : String(fields.note)
    fields.note = n.trim() === '' ? null : n
  }

  if ('standard_labor_rate' in fields) {
    const n = parseNullableNumber(fields.standard_labor_rate)
    if (n === undefined) {
      return NextResponse.json({ error: 'Invalid standard labor rate' }, { status: 400 })
    }
    if (n !== null && n < 0) {
      return NextResponse.json({ error: 'Standard labor rate cannot be negative' }, { status: 400 })
    }
    fields.standard_labor_rate = n
  }

  if ('warranty_labor_rate' in fields) {
    const n = parseNullableNumber(fields.warranty_labor_rate)
    if (n === undefined) {
      return NextResponse.json({ error: 'Invalid warranty labor rate' }, { status: 400 })
    }
    if (n !== null && n < 0) {
      return NextResponse.json({ error: 'Warranty labor rate cannot be negative' }, { status: 400 })
    }
    fields.warranty_labor_rate = n
  }

  const nextStatus = 'status' in fields ? String(fields.status) : prevStatus
  const leavingChurned = prevStatus === 'inactive' && nextStatus !== 'inactive'

  const wantsDisqualifiedPatch = 'disqualified_reason' in rawFields || 'disqualified_notes' in rawFields

  if (wantsDisqualifiedPatch && nextStatus !== 'inactive' && !leavingChurned) {
    return NextResponse.json(
      { error: 'Disqualified fields can only be set while status is Churned' },
      { status: 400 },
    )
  }

  if (leavingChurned) {
    fields.disqualified_reason = null
    fields.disqualified_at = null
    fields.disqualified_notes = null
  } else if (nextStatus === 'inactive' && wantsDisqualifiedPatch) {
    if ('disqualified_reason' in rawFields) {
      const parsed = parseDisqualifiedReason(rawFields.disqualified_reason)
      if (rawFields.disqualified_reason !== null && rawFields.disqualified_reason !== '' && parsed === null) {
        return NextResponse.json({ error: 'Invalid disqualified reason' }, { status: 400 })
      }
      fields.disqualified_reason = parsed
      if (parsed === null) {
        fields.disqualified_at = null
      } else if (prevDisqualifiedReason == null) {
        fields.disqualified_at = new Date().toISOString()
      }
    }
    if ('disqualified_notes' in rawFields) {
      const dn = typeof rawFields.disqualified_notes === 'string'
        ? rawFields.disqualified_notes
        : rawFields.disqualified_notes == null
          ? ''
          : String(rawFields.disqualified_notes)
      fields.disqualified_notes = dn.trim() === '' ? null : dn
    }
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
    const priorChain = existingRow.chain_name as string | null | undefined
    if (!priorChain) {
      fields.chain_name = detectChain(fields.name) ?? null
    }
  }

  if ('address_line1' in fields || 'city' in fields || 'state' in fields || 'postal_code' in fields) {
    const merged = {
      address_line1: existingRow.address_line1,
      city: existingRow.city,
      state: existingRow.state,
      postal_code: existingRow.postal_code,
      ...fields,
    }
    const coords = await geocodeAddress(merged as { address_line1?: string; city?: string; state?: string; postal_code?: string })
    if (coords) {
      fields.lat = coords.lat
      fields.lng = coords.lng
      fields.geocoded_at = new Date().toISOString()
      fields.county = coords.county
      if (coords.state && stateFieldIsEmpty(merged.state as string | undefined)) {
        fields.state = coords.state
      }
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
