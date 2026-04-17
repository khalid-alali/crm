import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { isContactRole } from '@/lib/contact-roles'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = req.nextUrl.searchParams.get('account_id')
  const locationId = req.nextUrl.searchParams.get('location_id')

  if (!accountId && !locationId) {
    return NextResponse.json({ error: 'account_id or location_id is required' }, { status: 400 })
  }

  let q = supabaseAdmin.from('contacts').select('*').order('created_at', { ascending: true })
  if (accountId) q = q.eq('account_id', accountId)
  else q = q.eq('location_id', locationId!)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const account_id = typeof body.account_id === 'string' ? body.account_id : null
  const location_id = typeof body.location_id === 'string' ? body.location_id : null
  if (!account_id && !location_id) {
    return NextResponse.json({ error: 'account_id or location_id is required' }, { status: 400 })
  }

  const role = isContactRole(body.role) ? body.role : 'other'
  const is_primary = Boolean(body.is_primary)
  if (is_primary && !account_id) {
    return NextResponse.json({ error: 'account_id is required when is_primary is true' }, { status: 400 })
  }

  if (is_primary && account_id) {
    await supabaseAdmin.from('contacts').update({ is_primary: false }).eq('account_id', account_id)
  }

  const insert = {
    account_id,
    location_id,
    name: typeof body.name === 'string' ? body.name.trim() || null : null,
    email: typeof body.email === 'string' ? body.email.trim() || null : null,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    role,
    is_primary,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
  }

  const { data, error } = await supabaseAdmin.from('contacts').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
