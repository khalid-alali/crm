import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { remindSigningRequest } from '@/lib/zohosign'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const { id, contractId } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: link } = await supabaseAdmin
    .from('contract_locations')
    .select('contract_id')
    .eq('contract_id', contractId)
    .eq('location_id', id)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'Contract is not linked to this shop.' }, { status: 400 })
  }

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, status, zoho_sign_request_id')
    .eq('id', contractId)
    .single()

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  if (contract.status !== 'sent' && contract.status !== 'viewed') {
    return NextResponse.json({ error: 'Only sent or in-progress contracts can be reminded.' }, { status: 400 })
  }

  const requestId = typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
  if (!requestId) {
    return NextResponse.json({ error: 'No Zoho Sign request on this contract.' }, { status: 400 })
  }

  try {
    await remindSigningRequest(requestId)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Zoho Sign remind failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
