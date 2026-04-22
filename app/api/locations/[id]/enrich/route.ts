import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { enrichLeadLocation } from '@/lib/google-places-enrichment'
import { resolvePrimaryContact } from '@/lib/primary-contact'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: loc, error: locErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, postal_code, account_id')
    .eq('id', id)
    .maybeSingle()

  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 })
  if (!loc) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const primary = await resolvePrimaryContact(supabaseAdmin, loc.account_id, id)
  const submittedPhone = primary?.phone?.trim() ?? ''

  const result = await enrichLeadLocation(supabaseAdmin, {
    locationId: id,
    shopName: String(loc.name ?? '').trim() || 'Shop',
    postalCode: loc.postal_code,
    submittedPhone,
  })

  if (primary?.id && result.contactPhone !== submittedPhone) {
    await supabaseAdmin.from('contacts').update({ phone: result.contactPhone }).eq('id', primary.id)
  }

  const { data: after, error: afterErr } = await supabaseAdmin
    .from('locations')
    .select('enrichment_status')
    .eq('id', id)
    .single()

  if (afterErr) return NextResponse.json({ error: afterErr.message }, { status: 500 })

  const status = after?.enrichment_status as string | undefined
  let message = 'Enrichment finished.'
  if (status === 'enriched') message = 'Location updated from Google Places.'
  else if (status === 'needs_review') message = 'No confident Google match; marked needs review.'
  else if (status === 'failed') message = 'Enrichment failed (see location_enrichment in Supabase).'

  return NextResponse.json({
    ok: true,
    enrichment_status: status ?? null,
    message,
  })
}
