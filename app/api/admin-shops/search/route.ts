import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

type MatchRow = {
  id: string
  name: string
  status: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  motherduck_shop_id: string
  primary_contact_email: string | null
  owner_id: string | null
  owners: { name: string | null; email: string | null } | Array<{ name: string | null; email: string | null }> | null
}

function clean(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function ownerFromRow(row: MatchRow): { name: string | null; email: string | null } | null {
  if (!row.owners) return null
  if (Array.isArray(row.owners)) return row.owners[0] ?? null
  return row.owners
}

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const needle = clean(q)

  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, status, address_line1, city, state, postal_code, motherduck_shop_id, primary_contact_email, owner_id, owners(name, email)')
    .not('motherduck_shop_id', 'is', null)
    .order('name', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ranked = ((data ?? []) as MatchRow[])
    .map(row => {
      const owner = ownerFromRow(row)
      const fields = [
        row.name,
        row.address_line1,
        row.city,
        row.state,
        row.postal_code,
        row.primary_contact_email,
        owner?.email,
        owner?.name,
        row.motherduck_shop_id,
      ]
      const hay = fields.map(clean)
      let score = 0
      for (const field of hay) {
        if (!field) continue
        if (field === needle) score += 100
        else if (field.startsWith(needle)) score += 60
        else if (field.includes(needle)) score += 30
      }
      return {
        score,
        row: {
          id: row.id,
          name: row.name,
          status: row.status,
          address_line1: row.address_line1,
          city: row.city,
          state: row.state,
          postal_code: row.postal_code,
          motherduck_shop_id: row.motherduck_shop_id,
          primary_contact_email: row.primary_contact_email,
          owner_name: owner?.name ?? null,
          owner_email: owner?.email ?? null,
        },
      }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(item => item.row)

  return NextResponse.json({ results: ranked })
}
