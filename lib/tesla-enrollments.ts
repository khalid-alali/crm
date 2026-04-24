import type { SupabaseClient } from '@supabase/supabase-js'
import { TESLA_PROGRAM_ID, getProgramConfig } from '@/lib/program-config'
import { deriveProgramStage, getMissingChecklistKeys, isTeslaStage, type TeslaStage } from '@/lib/program-stage'

type EnrollmentRow = {
  id: string
  location_id: string
  program_id: string
  stage: string
  tier: string | null
  manual_stage_override: boolean
  last_touched_at: string | null
  first_job_completed_at: string | null
  created_at: string
  updated_at: string
}

type LocationRow = {
  id: string
  name: string
  status: string
  city: string | null
  state: string | null
  county: string | null
  capabilities_submitted_at: string | null
  high_priority_target: boolean | null
  account_id: string | null
  motherduck_shop_id: string | null
}

type AccountRow = {
  id: string
  business_name: string | null
}

type ChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
  notes: string | null
}

type TechSurveyRow = {
  location_id: string
}

type ShopStatusCacheRow = {
  shop_id: string
  is_vinfast_shop: boolean | null
  is_active: boolean | null
  max_jobs_per_day: number | null
  max_jobs_per_week: number | null
}

export type TeslaEnrollmentView = {
  id: string
  locationId: string
  locationName: string
  city: string | null
  state: string | null
  county: string | null
  accountName: string | null
  stage: TeslaStage
  tier: 'generalist' | 'specialist' | null
  manualStageOverride: boolean
  lastTouchedAt: string | null
  firstJobCompletedAt: string | null
  hasShopSurvey: boolean
  hasTechSurvey: boolean
  vinfastActive: boolean
  highSignalName: boolean
  checklist: {
    itemKey: string
    label: string
    completedAt: string | null
    notes: string | null
  }[]
  missingChecklistKeys: string[]
}

function parseStage(value: string): TeslaStage {
  return isTeslaStage(value) ? value : 'not_ready'
}

const HIGH_SIGNAL_NAME_RE = /\b(ev|electric|hybrid|voltage|tesla)\b/i

function isHighSignalShopName(name: string | null | undefined): boolean {
  if (!name) return false
  return HIGH_SIGNAL_NAME_RE.test(name)
}

async function ensureDefaultTeslaEnrollments(supabaseAdmin: SupabaseClient): Promise<void> {
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('location_id')
    .eq('program_id', TESLA_PROGRAM_ID)

  if (existingError) throw new Error(existingError.message)

  const existingLocationIds = new Set((existingRows ?? []).map(row => row.location_id as string))
  const { data: eligibleLocations, error: eligibleError } = await supabaseAdmin
    .from('locations')
    .select('id')
    .in('status', ['contracted', 'active'])

  if (eligibleError) throw new Error(eligibleError.message)

  const now = new Date().toISOString()
  const rowsToInsert = (eligibleLocations ?? [])
    .map(row => row.id as string)
    .filter(locationId => !existingLocationIds.has(locationId))
    .map(locationId => ({
      location_id: locationId,
      program_id: TESLA_PROGRAM_ID,
      stage: 'not_ready',
      manual_stage_override: false,
      last_touched_at: now,
    }))

  if (rowsToInsert.length === 0) return

  const { error: insertError } = await supabaseAdmin
    .from('location_program_enrollments')
    .upsert(rowsToInsert, {
      onConflict: 'location_id,program_id',
      ignoreDuplicates: true,
    })

  if (insertError) throw new Error(insertError.message)
}

export async function listTeslaEnrollments(
  supabaseAdmin: SupabaseClient,
): Promise<TeslaEnrollmentView[]> {
  await ensureDefaultTeslaEnrollments(supabaseAdmin)

  const { data: enrollmentsData, error: enrollmentsError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select(
      `
      id,
      location_id,
      program_id,
      stage,
      tier,
      manual_stage_override,
      last_touched_at,
      first_job_completed_at,
      created_at,
      updated_at
    `,
    )
    .eq('program_id', TESLA_PROGRAM_ID)
    .order('updated_at', { ascending: false })

  if (enrollmentsError) {
    throw new Error(enrollmentsError.message)
  }

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[]
  if (enrollments.length === 0) return []

  const enrollmentIds = enrollments.map(row => row.id)
  const locationIds = enrollments.map(row => row.location_id)

  const { data: locationsData, error: locationsError } = await supabaseAdmin
    .from('locations')
    .select(
      'id, name, status, city, state, county, capabilities_submitted_at, high_priority_target, account_id, motherduck_shop_id',
    )
    .in('id', locationIds)

  if (locationsError) throw new Error(locationsError.message)

  const accountIds = Array.from(
    new Set((locationsData ?? []).map(row => row.account_id).filter((id): id is string => Boolean(id))),
  )

  const { data: accountsData, error: accountsError } = accountIds.length
    ? await supabaseAdmin.from('accounts').select('id, business_name').in('id', accountIds)
    : { data: [], error: null }

  if (accountsError) throw new Error(accountsError.message)

  const cacheKeys = Array.from(
    new Set(
      (locationsData ?? [])
        .map(row => row.motherduck_shop_id)
        .filter((id): id is string => Boolean(id))
        .concat(locationIds),
    ),
  )

  const [{ data: checklistData, error: checklistError }, { data: cacheData, error: cacheError }] =
    await Promise.all([
      supabaseAdmin
        .from('program_enrollment_checklist')
        .select('enrollment_id, item_key, completed_at, notes')
        .in('enrollment_id', enrollmentIds),
      supabaseAdmin
        .from('shop_status_cache')
        .select('shop_id, is_vinfast_shop, is_active, max_jobs_per_day, max_jobs_per_week')
        .in('shop_id', cacheKeys),
    ])

  if (checklistError) throw new Error(checklistError.message)
  if (cacheError) throw new Error(cacheError.message)

  const { data: surveyRowsData, error: surveyCountsError } = await supabaseAdmin
    .from('tech_competency_surveys')
    .select('location_id')
    .in('location_id', locationIds)

  if (surveyCountsError) throw new Error(surveyCountsError.message)

  const checklistByEnrollment = new Map<string, ChecklistRow[]>()
  for (const row of (checklistData ?? []) as ChecklistRow[]) {
    const existing = checklistByEnrollment.get(row.enrollment_id)
    if (existing) existing.push(row)
    else checklistByEnrollment.set(row.enrollment_id, [row])
  }

  const surveyCountByLocation = new Map<string, number>()
  for (const row of (surveyRowsData ?? []) as TechSurveyRow[]) {
    const prev = surveyCountByLocation.get(row.location_id) ?? 0
    surveyCountByLocation.set(row.location_id, prev + 1)
  }

  const cacheByLocation = new Map<string, ShopStatusCacheRow>()
  for (const row of (cacheData ?? []) as ShopStatusCacheRow[]) {
    cacheByLocation.set(row.shop_id, row)
  }

  const locationById = new Map<string, LocationRow>()
  for (const row of (locationsData ?? []) as LocationRow[]) {
    locationById.set(row.id, row)
  }

  const accountById = new Map<string, AccountRow>()
  for (const row of (accountsData ?? []) as AccountRow[]) {
    accountById.set(row.id, row)
  }

  return enrollments.flatMap(enrollment => {
    const config = getProgramConfig(enrollment.program_id)
    const checklistRows = checklistByEnrollment.get(enrollment.id) ?? []
    const completedKeys = checklistRows
      .filter(row => !!row.completed_at)
      .map(row => row.item_key)

    const derivedStage = deriveProgramStage({
      programId: enrollment.program_id,
      checklistCompletedKeys: completedKeys,
      firstJobCompletedAt: enrollment.first_job_completed_at,
      currentStage: parseStage(enrollment.stage),
      manualStageOverride: enrollment.manual_stage_override,
    })

    const rowsByKey = new Map(checklistRows.map(row => [row.item_key, row]))
    const checklist = (config?.checklist ?? []).map(item => {
      const row = rowsByKey.get(item.key)
      return {
        itemKey: item.key,
        label: item.label,
        completedAt: row?.completed_at ?? null,
        notes: row?.notes ?? null,
      }
    })

    const location = locationById.get(enrollment.location_id) ?? null
    if (!location) return []

    const account = location.account_id ? accountById.get(location.account_id) ?? null : null
    const cacheLookupKey = location?.motherduck_shop_id ?? enrollment.location_id
    const vinfast = cacheByLocation.get(cacheLookupKey)

    const stage = location.status === 'inactive' ? 'disqualified' : derivedStage

    return [{
      id: enrollment.id,
      locationId: enrollment.location_id,
      locationName: location?.name ?? 'Unknown shop',
      city: location?.city ?? null,
      state: location?.state ?? null,
      county: location?.county ?? null,
      accountName: account?.business_name ?? null,
      stage,
      tier:
        enrollment.tier === 'generalist' || enrollment.tier === 'specialist'
          ? enrollment.tier
          : null,
      manualStageOverride: enrollment.manual_stage_override,
      lastTouchedAt: enrollment.last_touched_at ?? enrollment.updated_at,
      firstJobCompletedAt: enrollment.first_job_completed_at,
      hasShopSurvey: Boolean(location?.capabilities_submitted_at),
      hasTechSurvey: (surveyCountByLocation.get(enrollment.location_id) ?? 0) > 0,
      vinfastActive: Boolean(
        vinfast?.is_vinfast_shop &&
          vinfast?.is_active &&
          (vinfast?.max_jobs_per_day ?? 0) > 0 &&
          (vinfast?.max_jobs_per_week ?? 0) > 0,
      ),
      highSignalName: isHighSignalShopName(location?.name),
      checklist,
      missingChecklistKeys: getMissingChecklistKeys(enrollment.program_id, completedKeys),
    }]
  })
}
