import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const business_name =
    typeof body.business_name === 'string' && body.business_name.trim() ? body.business_name.trim() : null
  if (!business_name) {
    return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
  }

  const { data: account, error } = await supabaseAdmin
    .from('accounts')
    .insert({
      business_name,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(account)
}
