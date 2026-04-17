import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { canDeleteContracts } from '@/lib/contract-permissions'
import { recallSigningRequest } from '@/lib/zohosign'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canDeleteContracts(session.user?.email)) {
    return NextResponse.json({ error: 'You do not have permission to delete contracts.' }, { status: 403 })
  }

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, status, zoho_sign_request_id')
    .eq('id', id)
    .single()

  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status === 'signed') {
    return NextResponse.json({ error: 'Signed contracts cannot be deleted.' }, { status: 400 })
  }

  if (contract.status === 'sent' || contract.status === 'viewed') {
    const requestId =
      typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
    if (requestId) {
      try {
        await recallSigningRequest(requestId)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Zoho Sign recall failed'
        return NextResponse.json({ error: message }, { status: 502 })
      }
    }
  }

  const { error } = await supabaseAdmin.from('contracts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
