import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { assertShopBillingReady } from '@/lib/expert-assist/billing-gates'
import { normalizeShopShortCode } from '@/lib/expert-assist/phone'
import { ensureToolboxCasePartner } from '@/lib/expert-assist/toolbox-partner'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const LOCATION_CONSULT_SELECT = `
  id,
  name,
  account_id,
  consult_enabled,
  consult_short_code,
  toolbox_case_partner,
  consult_billing_email,
  consult_billing_contact_name,
  consult_internal_notes,
  consult_billing_status,
  consult_stripe_customer_id,
  consult_stripe_payment_method_id,
  consult_stripe_card_last4,
  consult_service_writer_contact_id,
  consult_service_writer_is_owner
`

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const { data: loc, error: e1 } = await supabaseAdmin
    .from('locations')
    .select(LOCATION_CONSULT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (e1 || !loc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: contacts, error: e2 } = await supabaseAdmin
    .from('shop_approved_contacts')
    .select('*')
    .eq('shop_id', id)
    .order('created_at', { ascending: false })

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  let serviceWriterContact: Record<string, unknown> | null = null
  const serviceWriterContactId = (loc as { consult_service_writer_contact_id?: string | null })
    .consult_service_writer_contact_id
  if (serviceWriterContactId) {
    const { data: sw, error: swErr } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, phone, role, is_expert_assist_service_writer')
      .eq('id', serviceWriterContactId)
      .maybeSingle()
    if (swErr) return NextResponse.json({ error: swErr.message }, { status: 500 })
    serviceWriterContact = sw
  }

  const { data: cases, error: e3 } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, created_at, closed_at, billed_amount_cents')
    .eq('shop_id', id)
    .order('created_at', { ascending: false })
    .limit(80)

  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

  try {
    loc.toolbox_case_partner = await ensureToolboxCasePartner(id, loc.name)
  } catch (e) {
    console.error('ensureToolboxCasePartner', e)
  }

  return NextResponse.json({
    location: loc,
    serviceWriterContact,
    contacts: contacts ?? [],
    cases: cases ?? [],
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json()) as {
    consult_enabled?: boolean
    consult_short_code?: string | null
    consult_billing_email?: string | null
    consult_billing_contact_name?: string | null
    consult_internal_notes?: string | null
  }

  const patch: Record<string, unknown> = {}

  if (body.consult_short_code !== undefined) {
    const code =
      body.consult_short_code === null || body.consult_short_code === '' ?
        null
      : normalizeShopShortCode(body.consult_short_code)
    if (code) {
      const { data: clash } = await supabaseAdmin
        .from('locations')
        .select('id')
        .eq('consult_short_code', code)
        .neq('id', id)
        .maybeSingle()
      if (clash) return NextResponse.json({ error: 'Short code already in use' }, { status: 400 })
    }
    patch.consult_short_code = code
  }

  if (body.consult_billing_email !== undefined) patch.consult_billing_email = body.consult_billing_email?.trim() || null
  if (body.consult_billing_contact_name !== undefined) {
    patch.consult_billing_contact_name = body.consult_billing_contact_name?.trim() || null
  }
  if (body.consult_internal_notes !== undefined) patch.consult_internal_notes = body.consult_internal_notes ?? null

  if (body.consult_enabled !== undefined) {
    if (body.consult_enabled) {
      const gate = await assertShopBillingReady(id)
      if (!gate.ok) {
        return NextResponse.json(
          { error: `Cannot enable consults: ${gate.reason}. Complete Stripe billing first.` },
          { status: 400 }
        )
      }
    }
    patch.consult_enabled = body.consult_enabled
  }

  const { error } = await supabaseAdmin.from('locations').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/shops/${id}`)
  return NextResponse.json({ ok: true })
}
