import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { submitLaborRateApproval } from '@/lib/labor-rate-approval/submit'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const submittedByEmail = session.user?.email?.trim()
  if (!submittedByEmail) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 400 })
  }

  let body: {
    location_id?: string
    charge_rate?: unknown
    benchmark_average_rate?: unknown
    benchmark_shops_surveyed?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const locationId = typeof body.location_id === 'string' ? body.location_id.trim() : ''
  const chargeRate = Number(body.charge_rate)
  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const benchmarkAverageRate =
    body.benchmark_average_rate === '' || body.benchmark_average_rate == null
      ? null
      : Number(body.benchmark_average_rate)
  const benchmarkShopsSurveyed =
    body.benchmark_shops_surveyed === '' || body.benchmark_shops_surveyed == null
      ? null
      : Number(body.benchmark_shops_surveyed)

  try {
    const row = await submitLaborRateApproval(supabaseAdmin, {
      locationId,
      chargeRate,
      submittedByEmail,
      benchmarkAverageRate:
        benchmarkAverageRate != null && Number.isFinite(benchmarkAverageRate) && benchmarkAverageRate > 0
          ? benchmarkAverageRate
          : null,
      benchmarkShopsSurveyed:
        benchmarkShopsSurveyed != null &&
        Number.isFinite(benchmarkShopsSurveyed) &&
        benchmarkShopsSurveyed > 0
          ? Math.round(benchmarkShopsSurveyed)
          : null,
    })
    revalidatePath('/vinfast')
    return NextResponse.json({ ok: true, approval: row })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Submit failed'
    const status =
      msg.includes('already approved') || msg.includes('must be set') || msg.includes('greater than 0')
        ? 400
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
