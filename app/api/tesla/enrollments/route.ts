import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { listTeslaEnrollments } from '@/lib/tesla-enrollments'
import { supabaseAdmin } from '@/lib/supabase'
import { isTeslaStage, type TeslaStage } from '@/lib/program-stage'

type FilterParams = {
  q: string
  county: string
  shopSurvey: boolean
  techSurvey: boolean
  vinfastActive: boolean
  highSignalName: boolean
  stage: TeslaStage | null
}

function asBool(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

function parseFilters(req: NextRequest): FilterParams {
  const sp = req.nextUrl.searchParams
  const stageRaw = sp.get('stage')
  return {
    q: (sp.get('q') ?? '').trim().toLowerCase(),
    county: (sp.get('county') ?? '').trim(),
    shopSurvey: asBool(sp.get('shopSurvey')),
    techSurvey: asBool(sp.get('techSurvey')),
    vinfastActive: asBool(sp.get('vinfastActive')),
    highSignalName: asBool(sp.get('highSignalName')),
    stage: stageRaw && isTeslaStage(stageRaw) ? stageRaw : null,
  }
}

function applyFilters(rows: Awaited<ReturnType<typeof listTeslaEnrollments>>, filters: FilterParams) {
  return rows.filter(row => {
    if (filters.stage && row.stage !== filters.stage) return false
    if (filters.county && (row.county ?? '') !== filters.county) return false
    if (filters.shopSurvey && !row.hasShopSurvey) return false
    if (filters.techSurvey && !row.hasTechSurvey) return false
    if (filters.vinfastActive && !row.vinfastActive) return false
    if (filters.highSignalName && !row.highSignalName) return false

    if (filters.q) {
      const haystack = [
        row.locationName,
        row.accountName,
        row.city,
        row.state,
        row.county,
      ]
        .map(v => (v ?? '').toLowerCase())
        .join(' ')
      if (!haystack.includes(filters.q)) return false
    }

    return true
  })
}

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await listTeslaEnrollments(supabaseAdmin)
    const filtered = applyFilters(rows, parseFilters(req))
    return NextResponse.json({ enrollments: filtered })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Tesla enrollments'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
