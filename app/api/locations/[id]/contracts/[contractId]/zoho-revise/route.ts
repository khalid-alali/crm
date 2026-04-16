import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { reviseSentContractRecipient } from '@/lib/contract-zoho-revise'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const { id, contractId } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { counterparty_name?: string; counterparty_email?: string; from_shop_detail?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.counterparty_name === 'string' ? body.counterparty_name.trim() : ''
  const email = typeof body.counterparty_email === 'string' ? body.counterparty_email.trim() : ''
  if (!name) return NextResponse.json({ error: 'Recipient name is required' }, { status: 400 })
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid recipient email is required' }, { status: 400 })
  }

  const { data: link } = await supabaseAdmin
    .from('contract_locations')
    .select('contract_id')
    .eq('contract_id', contractId)
    .eq('location_id', id)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'Contract is not linked to this shop.' }, { status: 400 })
  }

  try {
    await reviseSentContractRecipient(contractId, {
      recipientName: name,
      recipientEmail: email,
      sentBy: session.user?.email ?? 'unknown',
      fromShopDetail: Boolean(body.from_shop_detail),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Zoho Sign revise failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
