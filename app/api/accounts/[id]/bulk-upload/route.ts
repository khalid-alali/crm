import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import {
  buildBulkUploadDedupKey,
  buildExistingBulkUploadKeys,
  iterBulkUploadRowsForCommit,
  parseBulkUploadCsv,
} from '@/lib/account-bulk-location-upload'
import {
  accountHasSignedContract,
  initialLocationStatusForAccount,
} from '@/lib/account-has-signed-contract'
import { activeLocations } from '@/lib/locations-active'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress, stateFieldIsEmpty } from '@/lib/geocode'

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

  const parsed = parseBulkUploadCsv(await file.text())
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { data: existingLocations, error: existingErr } = await activeLocations(
    supabaseAdmin,
    'address_line1, state, postal_code',
  ).eq('account_id', accountId)
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const existingKeys = buildExistingBulkUploadKeys(existingLocations ?? [])

  let hasSignedContract = false
  try {
    hasSignedContract = await accountHasSignedContract(supabaseAdmin, accountId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load contracts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const initialStatus = initialLocationStatusForAccount(hasSignedContract)

  let created = 0
  let skipped = 0
  let contactsCreated = 0
  const errors: { row: number; message: string }[] = []

  for (const row of iterBulkUploadRowsForCommit(parsed)) {
    if ('message' in row) {
      errors.push(row)
      skipped += 1
      continue
    }

    const dedupKey = buildBulkUploadDedupKey(row.address, row.state, row.postalCode)
    if (existingKeys.has(dedupKey)) {
      skipped += 1
      continue
    }

    const locationInsert: Record<string, unknown> = {
      account_id: accountId,
      name: row.name,
      address_line1: row.address,
      city: row.city,
      state: row.state,
      postal_code: row.postalCode,
      status: initialStatus,
      chain_name: detectChain(row.name),
      ...(row.storeNumber ? { store_number: row.storeNumber } : {}),
    }

    const coords = await geocodeAddress({
      address_line1: row.address,
      city: row.city ?? undefined,
      state: row.state,
      postal_code: row.postalCode,
    })
    if (coords) {
      locationInsert.lat = coords.lat
      locationInsert.lng = coords.lng
      locationInsert.geocoded_at = new Date().toISOString()
      locationInsert.county = coords.county
      if (coords.state && stateFieldIsEmpty(row.state)) {
        locationInsert.state = coords.state
      }
    }

    const { data: location, error: insertErr } = await supabaseAdmin
      .from('locations')
      .insert(locationInsert)
      .select('id')
      .single()
    if (insertErr || !location) {
      errors.push({ row: row.rowNumber, message: insertErr?.message ?? 'Failed to create location' })
      skipped += 1
      continue
    }

    await supabaseAdmin.from('activity_log').insert({
      location_id: location.id,
      type: 'shop_created',
      subject: 'Shop created (bulk upload)',
      sent_by: session.user?.email ?? 'unknown',
    })

    const emailTrim = row.contactEmail.trim()
    const phoneTrim = row.contactPhone.trim()
    if (emailTrim || phoneTrim) {
      const { error: contactErr } = await supabaseAdmin.from('contacts').insert({
        account_id: accountId,
        location_id: location.id,
        name: row.name || 'Shop contact',
        email: emailTrim || null,
        phone: phoneTrim || null,
        role: 'other',
        is_primary: false,
      })
      if (contactErr) {
        errors.push({
          row: row.rowNumber,
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
