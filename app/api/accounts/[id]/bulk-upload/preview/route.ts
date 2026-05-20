import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import {
  buildExistingBulkUploadKeys,
  parseBulkUploadCsv,
  previewBulkLocationUpload,
} from '@/lib/account-bulk-location-upload'
import { activeLocations } from '@/lib/locations-active'
import { supabaseAdmin } from '@/lib/supabase'

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
  const preview = previewBulkLocationUpload(parsed, existingKeys)

  return NextResponse.json(preview)
}
