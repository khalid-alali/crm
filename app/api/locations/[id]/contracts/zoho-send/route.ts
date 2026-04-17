import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { sendContractViaZoho } from '@/lib/contract-zoho-send'
import { resolvePrimaryContact } from '@/lib/primary-contact'

function formatLocationAddress(loc: {
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}) {
  return [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean).join(', ')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    counterparty_name?: string
    counterparty_email?: string
    standard_labor_rate?: unknown
    warranty_labor_rate?: unknown
    existing_draft_contract_id?: string | null
    from_shop_detail?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.counterparty_name === 'string' ? body.counterparty_name.trim() : ''
  const email = typeof body.counterparty_email === 'string' ? body.counterparty_email.trim() : ''
  if (!name) return NextResponse.json({ error: 'Shop owner name is required' }, { status: 400 })
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid shop owner email is required' }, { status: 400 })
  }

  const std = Number(body.standard_labor_rate)
  if (!Number.isFinite(std) || std <= 0) {
    return NextResponse.json({ error: 'Shop customer pay labor rate must be a positive number' }, { status: 400 })
  }

  let warranty: number | null = null
  if (body.warranty_labor_rate !== '' && body.warranty_labor_rate != null) {
    const w = Number(body.warranty_labor_rate)
    if (!Number.isFinite(w) || w < 0) {
      return NextResponse.json({ error: 'Shop warranty labor rate must be a valid number' }, { status: 400 })
    }
    warranty = w
  }

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations')
    .select('id, account_id, address_line1, city, state, postal_code')
    .eq('id', id)
    .single()

  if (locError || !location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const address = formatLocationAddress(location)
  const primary = await resolvePrimaryContact(supabaseAdmin, location.account_id, id)
  const phone = primary?.phone ?? null

  const existingId =
    typeof body.existing_draft_contract_id === 'string' && body.existing_draft_contract_id.trim()
      ? body.existing_draft_contract_id.trim()
      : null

  let contractId: string

  if (existingId) {
    const { data: link } = await supabaseAdmin
      .from('contract_locations')
      .select('contract_id')
      .eq('contract_id', existingId)
      .eq('location_id', id)
      .maybeSingle()

    if (!link) {
      return NextResponse.json({ error: 'That draft contract is not linked to this shop.' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('contracts')
      .select('id, status')
      .eq('id', existingId)
      .single()

    if (!existing || existing.status !== 'draft') {
      return NextResponse.json({ error: 'Contract is not in draft status.' }, { status: 400 })
    }

    const { error: upErr } = await supabaseAdmin
      .from('contracts')
      .update({
        counterparty_name: name,
        counterparty_email: email,
        standard_labor_rate: std,
        warranty_labor_rate: warranty,
        address,
        counterparty_phone: phone,
      })
      .eq('id', existingId)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    contractId = existingId
  } else {
    if (!location.account_id) {
      return NextResponse.json(
        { error: 'Link an account to this shop before sending a new contract, or use an existing draft on the Contracts tab.' },
        { status: 400 }
      )
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from('contracts')
      .insert({
        account_id: location.account_id,
        counterparty_name: name,
        counterparty_email: email,
        counterparty_phone: phone,
        standard_labor_rate: std,
        warranty_labor_rate: warranty,
        address,
        status: 'draft',
      })
      .select('id')
      .single()

    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message ?? 'Failed to create contract' }, { status: 500 })
    }

    contractId = created.id

    const { error: clErr } = await supabaseAdmin.from('contract_locations').insert({
      contract_id: contractId,
      location_id: id,
    })

    if (clErr) {
      await supabaseAdmin.from('contracts').delete().eq('id', contractId)
      return NextResponse.json({ error: clErr.message }, { status: 500 })
    }
  }

  try {
    await sendContractViaZoho(contractId, {
      fromShopDetail: Boolean(body.from_shop_detail),
      sentBy: session.user?.email ?? 'unknown',
      bdContactName: session.user?.name,
      bdContactEmail: session.user?.email,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Zoho Sign failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ ok: true, contractId })
}
