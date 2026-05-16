import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { coerceUsZip5OrNull, getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'

/** Raw CSV row — headers vary by export (e.g. LOCATION, Zip, Main Phone). */
type CsvRow = Record<string, string | undefined>

type RowError = {
  row: number
  message: string
}

function compact(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\u00a0/g, ' ').trim()
}

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '')
}

function normalizeHeaderKey(h: string): string {
  return stripBom(h)
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** One logical field, first matching column wins. */
function getFromNorm(norm: Record<string, string>, headerAliases: string[]): string {
  for (const alias of headerAliases) {
    const v = norm[normalizeHeaderKey(alias)]
    if (v) return v
  }
  return ''
}

function rowToNormalized(csvRow: CsvRow): Record<string, string> {
  const norm: Record<string, string> = {}
  for (const [k, v] of Object.entries(csvRow)) {
    norm[normalizeHeaderKey(k)] = compact(v)
  }
  return norm
}

/** US ZIP: accept 5, ZIP+4, 9 digits, or 4-digit (leading zero dropped in Excel). */
function coerceZipForBulkUpload(raw: unknown): string {
  const fromLib = coerceUsZip5OrNull(raw)
  if (fromLib) return fromLib
  const digits = compact(raw).replace(/\D/g, '')
  if (digits.length === 4 && /^\d{4}$/.test(digits)) return digits.padStart(5, '0')
  return normalizePostalCode(raw)
}

const REQUIRED_HEADER_GROUPS: string[][] = [
  ['address', 'street', 'address line 1'],
  ['state', 'st'],
  ['zip code', 'zip', 'postal code', 'postcode'],
]

function csvHasRequiredColumns(fields: (string | undefined)[]): boolean {
  const normHeaders = new Set(fields.filter(Boolean).map(f => normalizeHeaderKey(f!)))
  return REQUIRED_HEADER_GROUPS.every(group => group.some(a => normHeaders.has(normalizeHeaderKey(a))))
}

function buildDedupKey(address: string, state: string, postalCode: string): string {
  return `${address.toLowerCase()}|${state.toUpperCase()}|${postalCode}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accountExists, error: accountErr } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .single()
  if (accountErr || !accountExists) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'CSV file is required' }, { status: 400 })
  }

  const csvText = await file.text()
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: `Invalid CSV: ${parsed.errors[0]?.message ?? 'parse error'}` }, { status: 400 })
  }

  const headers = parsed.meta.fields ?? []
  if (!csvHasRequiredColumns(headers)) {
    return NextResponse.json(
      {
        error:
          'CSV must include columns for address, state, and ZIP/postal code. Accepted examples: Address, State, Zip or Zip code.',
      },
      { status: 400 },
    )
  }

  const { data: existingLocations, error: existingErr } = await supabaseAdmin
    .from('locations')
    .select('address_line1, state, postal_code')
    .eq('account_id', accountId)
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const existingKeys = new Set(
    (existingLocations ?? [])
      .map(loc => {
        const address = compact(loc.address_line1)
        const state = compact(loc.state)
        const postalCode = coerceZipForBulkUpload(loc.postal_code)
        if (!address || !state || !postalCode || getPostalCodeError(postalCode)) return null
        return buildDedupKey(address, state, postalCode)
      })
      .filter(Boolean) as string[],
  )

  let created = 0
  let skipped = 0
  let contactsCreated = 0
  const errors: RowError[] = []

  for (let i = 0; i < parsed.data.length; i += 1) {
    const csvRow = (parsed.data[i] ?? {}) as CsvRow
    const rowNumber = i + 2
    const norm = rowToNormalized(csvRow)

    const address = getFromNorm(norm, ['address', 'street', 'address line 1'])
    const state = getFromNorm(norm, ['state', 'st']).toUpperCase()
    const postalCodeRaw = getFromNorm(norm, ['zip code', 'zip', 'postal code', 'postcode'])
    const postalCode = coerceZipForBulkUpload(postalCodeRaw)
    const city = getFromNorm(norm, ['city']) || null
    const explicitName = getFromNorm(norm, ['name', 'location', 'shop name', 'shop'])
    const contactEmail = getFromNorm(norm, ['email', 'e-mail'])
    const contactPhone = getFromNorm(norm, [
      'main phone',
      'phone',
      'mobile',
      'cell',
      'telephone',
      'published google number/marchex',
    ])

    if (!address) {
      errors.push({ row: rowNumber, message: 'Address is required.' })
      skipped += 1
      continue
    }
    if (!state) {
      errors.push({ row: rowNumber, message: 'State is required.' })
      skipped += 1
      continue
    }
    if (!postalCode) {
      errors.push({ row: rowNumber, message: 'ZIP / postal code is required.' })
      skipped += 1
      continue
    }
    const postalCodeError = getPostalCodeError(postalCode)
    if (postalCodeError) {
      errors.push({ row: rowNumber, message: postalCodeError })
      skipped += 1
      continue
    }

    const dedupKey = buildDedupKey(address, state, postalCode)
    if (existingKeys.has(dedupKey)) {
      skipped += 1
      continue
    }

    const name = explicitName || `Shop - ${address}`
    const locationInsert: Record<string, unknown> = {
      account_id: accountId,
      name,
      address_line1: address,
      city,
      state,
      postal_code: postalCode,
      status: 'lead',
      chain_name: detectChain(name),
    }

    const coords = await geocodeAddress({
      address_line1: address,
      city: city ?? undefined,
      state,
      postal_code: postalCode,
    })
    if (coords) {
      locationInsert.lat = coords.lat
      locationInsert.lng = coords.lng
      locationInsert.geocoded_at = new Date().toISOString()
      locationInsert.county = coords.county
      if (coords.state && stateFieldIsEmpty(state)) {
        locationInsert.state = coords.state
      }
    }

    const { data: location, error: insertErr } = await supabaseAdmin
      .from('locations')
      .insert(locationInsert)
      .select('id')
      .single()
    if (insertErr || !location) {
      errors.push({ row: rowNumber, message: insertErr?.message ?? 'Failed to create location' })
      skipped += 1
      continue
    }

    await supabaseAdmin.from('activity_log').insert({
      location_id: location.id,
      type: 'shop_created',
      subject: 'Shop created (bulk upload)',
      sent_by: session.user?.email ?? 'unknown',
    })

    const emailTrim = contactEmail.trim()
    const phoneTrim = contactPhone.trim()
    if (emailTrim || phoneTrim) {
      const { error: contactErr } = await supabaseAdmin.from('contacts').insert({
        account_id: accountId,
        location_id: location.id,
        name: name || 'Shop contact',
        email: emailTrim || null,
        phone: phoneTrim || null,
        role: 'other',
        is_primary: false,
      })
      if (contactErr) {
        errors.push({
          row: rowNumber,
          message: `Shop created, but contact was not saved: ${contactErr.message}`,
        })
      } else {
        contactsCreated += 1
      }
    }

    existingKeys.add(dedupKey)
    created += 1
  }

  revalidatePath(`/accounts/${accountId}`)
  revalidatePath('/shops')

  return NextResponse.json({ created, skipped, contactsCreated, errors })
}
