import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft contracts can be deleted.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('contracts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
