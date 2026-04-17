import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { isContactRole } from '@/lib/contact-roles'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data: existing, error: loadErr } = await supabaseAdmin.from('contacts').select('*').eq('id', id).single()
  if (loadErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existingRow = existing as {
    account_id: string | null
  }

  const updates: Record<string, unknown> = {}
  if ('account_id' in body) updates.account_id = typeof body.account_id === 'string' ? body.account_id : null
  if ('location_id' in body) updates.location_id = typeof body.location_id === 'string' ? body.location_id : null
  if ('name' in body) updates.name = typeof body.name === 'string' ? body.name.trim() || null : null
  if ('email' in body) updates.email = typeof body.email === 'string' ? body.email.trim() || null : null
  if ('phone' in body) updates.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  if ('role' in body && isContactRole(body.role)) updates.role = body.role
  if ('is_primary' in body) updates.is_primary = Boolean(body.is_primary)
  if ('notes' in body) updates.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

  const mergedAccountId =
    (updates.account_id !== undefined ? (updates.account_id as string | null) : existingRow.account_id) ?? null
  if (updates.is_primary === true && !mergedAccountId) {
    return NextResponse.json({ error: 'account_id is required when is_primary is true' }, { status: 400 })
  }
  if (updates.is_primary === true && mergedAccountId) {
    await supabaseAdmin.from('contacts').update({ is_primary: false }).eq('account_id', mergedAccountId).neq('id', id)
  }

  const { data, error } = await supabaseAdmin.from('contacts').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
