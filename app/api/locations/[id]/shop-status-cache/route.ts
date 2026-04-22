import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations')
    .select('id, motherduck_shop_id')
    .eq('id', id)
    .maybeSingle()

  if (locError) return NextResponse.json({ error: locError.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const shopId = typeof location.motherduck_shop_id === 'string' ? location.motherduck_shop_id.trim() : ''
  if (!shopId) {
    return NextResponse.json({ error: 'No admin shop linked for this location' }, { status: 400 })
  }

  const { data: row, error: cacheError } = await supabaseAdmin
    .from('shop_status_cache')
    .select('max_jobs_per_day, max_jobs_per_week, is_active, synced_at')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (cacheError) return NextResponse.json({ error: cacheError.message }, { status: 500 })

  return NextResponse.json({ row: row ?? null })
}
