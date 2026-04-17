import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { revalidatePath } from 'next/cache'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, business_name, notes, created_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (typeof body.business_name === 'string') updates.business_name = body.business_name.trim() || null
  if (typeof body.notes === 'string') updates.notes = body.notes.trim() || null

  const { data, error } = await supabaseAdmin.from('accounts').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count: contractCount, error: contractCountError } = await supabaseAdmin
    .from('contracts')
    .select('id', { head: true, count: 'exact' })
    .eq('account_id', id)

  if (contractCountError) {
    return NextResponse.json({ error: contractCountError.message }, { status: 500 })
  }

  if ((contractCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete account with linked contracts. Remove contracts first.' },
      { status: 409 },
    )
  }

  const { error } = await supabaseAdmin.from('accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/accounts')
  revalidatePath('/shops')

  return NextResponse.json({ ok: true })
}
