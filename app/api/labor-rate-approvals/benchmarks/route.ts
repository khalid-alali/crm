import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { pullLaborRateBenchmarks } from '@/lib/labor-rate-approval/benchmarks'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locationId = req.nextUrl.searchParams.get('location_id')?.trim() ?? ''
  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  try {
    const result = await pullLaborRateBenchmarks(supabaseAdmin, locationId)
    return NextResponse.json({
      average_rate: result.averageRate,
      shops_surveyed: result.shopsSurveyed,
      shops: result.shops,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Benchmark query failed'
    const status = msg.includes('not found') || msg.includes('geocoded') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
