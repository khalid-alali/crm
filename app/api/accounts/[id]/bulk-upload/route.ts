import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'

type CsvRow = {
  Name?: string
  Address?: string
  City?: string
  State?: string
  'Zip code'?: string
}

type RowError = {
  row: number
  message: string
}

function compact(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

  const headers = (parsed.meta.fields ?? []).map(h => h.trim())
  const requiredHeaders = ['Address', 'State', 'Zip code']
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required header(s): ${missingHeaders.join(', ')}` },
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
        const postalCode = normalizePostalCode(loc.postal_code)
        if (!address || !state || !postalCode) return null
        return buildDedupKey(address, state, postalCode)
      })
      .filter(Boolean) as string[],
  )

  let created = 0
  let skipped = 0
  const errors: RowError[] = []

  for (let i = 0; i < parsed.data.length; i += 1) {
    const csvRow = parsed.data[i] ?? {}
    const rowNumber = i + 2

    const address = compact(csvRow.Address)
    const state = compact(csvRow.State).toUpperCase()
    const postalCode = normalizePostalCode(csvRow['Zip code'])
    const city = compact(csvRow.City) || null
    const explicitName = compact(csvRow.Name)

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

    existingKeys.add(dedupKey)
    created += 1
  }

  revalidatePath(`/accounts/${accountId}`)
  revalidatePath('/shops')

  return NextResponse.json({ created, skipped, errors })
}
