import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { listTeslaEnrollments } from '@/lib/tesla-enrollments'
import { supabaseAdmin } from '@/lib/supabase'
import { isTeslaStage, type TeslaStage } from '@/lib/program-stage'
import { enrollLocationInProgram } from '@/lib/program-enrollment-service'
import { TESLA_PROGRAM_ID } from '@/lib/program-config'

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

type EnrollBody = {
  location_id?: string
  location_ids?: string[]
}

export async function POST(req: Request) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: EnrollBody
  try {
    body = (await req.json()) as EnrollBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const locationIds = Array.from(
    new Set(
      [
        ...(Array.isArray(body.location_ids) ? body.location_ids : []),
        ...(body.location_id ? [body.location_id] : []),
      ]
        .map(v => String(v).trim())
        .filter(Boolean),
    ),
  )

  if (locationIds.length === 0) {
    return NextResponse.json({ error: 'Provide at least one location id' }, { status: 400 })
  }

  const actor = session.user?.email ?? null
  let created = 0
  let alreadyActive = 0
  const enrollmentIds: string[] = []

  for (const locationId of locationIds) {
    try {
      const result = await enrollLocationInProgram(supabaseAdmin, {
        locationId,
        programId: TESLA_PROGRAM_ID,
        actorId: actor,
      })
      enrollmentIds.push(result.enrollmentId)
      if (result.created) {
        created++
        await supabaseAdmin.from('activity_log').insert({
          location_id: locationId,
          type: 'note',
          body: 'Enrolled in Tesla program.',
          sent_by: actor ?? 'unknown',
        })
      } else {
        alreadyActive++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enrollment failed'
      return NextResponse.json({ error: message, location_id: locationId }, { status: 500 })
    }
  }

  revalidatePath('/tesla')
  revalidatePath('/shops')
  return NextResponse.json({
    ok: true,
    created,
    already_active: alreadyActive,
    enrollment_ids: enrollmentIds,
  })
}
