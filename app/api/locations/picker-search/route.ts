import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'

export type PickerLocation = {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
}

/** Strip characters that break PostgREST `or` / ILIKE patterns. */
function sanitizeQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/%/g, '')
    .replace(/_/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = sanitizeQuery(req.nextUrl.searchParams.get('q') ?? '')
  if (q.length < 2) {
    return NextResponse.json({ results: [] as PickerLocation[] })
  }

  const pattern = `%${q}%`
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, chain_name, city, state')
    .or(`name.ilike.${pattern},chain_name.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(50)

  if (error) {
    console.error('picker-search', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  type Row = {
    id: string
    name: string
    chain_name: string | null
    city: string | null
    state: string | null
  }

  const results = ((data ?? []) as Row[]).map((row): PickerLocation => ({
    id: row.id,
    name: row.name,
    chain_name: row.chain_name,
    city: row.city,
    state: row.state,
  }))

  return NextResponse.json({ results })
}
