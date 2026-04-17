import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') ?? ''

  let query = supabaseAdmin.from('accounts').select('id, business_name').order('business_name').limit(20)

  if (q) {
    query = query.ilike('business_name', `%${q}%`)
  }

  const { data } = await query
  return NextResponse.json(data ?? [])
}
