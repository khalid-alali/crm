import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getLatestShopOverrideStatus } from '@/lib/motherduck-shop-overrides'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .select('id, motherduck_shop_id')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  if (!location.motherduck_shop_id) {
    return NextResponse.json({ operational_status: null, motherduck_shop_id: null })
  }

  if (!process.env.MOTHERDUCK_TOKEN?.trim()) {
    return NextResponse.json(
      {
        operational_status: null,
        motherduck_shop_id: location.motherduck_shop_id,
        error: 'MOTHERDUCK_TOKEN is not configured on the CRM server',
      },
      { status: 503 },
    )
  }

  try {
    const operationalStatus = await getLatestShopOverrideStatus(location.motherduck_shop_id)
    return NextResponse.json({
      operational_status: operationalStatus,
      motherduck_shop_id: location.motherduck_shop_id,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'MotherDuck query failed'
    return NextResponse.json(
      {
        operational_status: null,
        motherduck_shop_id: location.motherduck_shop_id,
        error: message,
      },
      { status: 502 },
    )
  }
}
