import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { revokeContractInZoho } from '@/lib/contract-zoho-revoke'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; contractId: string }> }) {
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

  try {
    await revokeContractInZoho(contractId, {
      revokedBy: session.user?.email ?? 'unknown',
      fromShopDetail: true,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Zoho Sign revoke failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
