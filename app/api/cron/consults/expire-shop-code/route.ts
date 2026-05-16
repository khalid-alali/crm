import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_CONSULTS_TOKEN?.trim() ?? ''
  return Boolean(expected && token === expected)
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id')
    .eq('status', 'awaiting_shop_code')
    .lt('created_at', cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows ?? []).map(r => (r as { id: string }).id)
  if (ids.length === 0) return NextResponse.json({ cancelled: 0 })

  const now = new Date().toISOString()
  await supabaseAdmin
    .from('consult_cases')
    .update({ status: 'cancelled', closed_at: now })
    .in('id', ids)

  return NextResponse.json({ cancelled: ids.length })
}
