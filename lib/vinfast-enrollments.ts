import type { SupabaseClient } from '@supabase/supabase-js'
import { activeLocations } from '@/lib/locations-active'
import { VINFAST_PROGRAM_ID, getProgramConfig } from '@/lib/program-config'
import { rowForCanonicalKey, type VinfastChecklistRow } from '@/lib/vinfast-checklist'
import { getMissingChecklistKeys, isTeslaStage, type TeslaStage } from '@/lib/program-stage'

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
  city: string | null
  state: string | null
  county: string | null
  status: string
  vf_onboarding_status: string | null
  vf_operational_status: string | null
  capabilities_submitted_at: string | null
  account_id: string | null
  motherduck_shop_id: string | null
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

type AccountRow = {
  id: string
  business_name: string | null
}

type ShopStatusCacheRow = {
  shop_id: string
  is_vinfast_shop: boolean | null
  is_active: boolean | null
  max_jobs_per_day: number | null
  max_jobs_per_week: number | null
}

const BATCH_SIZE = 200

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export type VinfastEnrollmentView = {
  id: string
  locationId: string
  locationName: string
  city: string | null
  state: string | null
  county: string | null
  accountName: string | null
  stage: string
  tier: 'generalist' | 'specialist' | null
  manualStageOverride: boolean
  lastTouchedAt: string | null
  firstJobCompletedAt: string | null
  hasShopSurvey: boolean
  hasTechSurvey: boolean
  vinfastActive: boolean
  checklist: {
    itemKey: string
    label: string
    completedAt: string | null
    notes: string | null
  }[]
  missingChecklistKeys: string[]
  /** Post-launch ops label from `locations.vf_operational_status` (e.g. Onboarding Paused). */
  vfOperationalStatus: string | null
  /** From `locations.vf_onboarding_status` (e.g. PIP). */
  vfOnboardingStatus: string | null
}

function normalizeVinfastStage(input: {
  locationStatus: string | null | undefined
  vfOnboardingStatus: string | null | undefined
  enrollmentStage: string
  manualStageOverride?: boolean
}): TeslaStage {
  const locationStatus = (input.locationStatus ?? '').trim().toLowerCase()
  if (locationStatus === 'inactive') return 'disqualified'

  const raw = (input.vfOnboardingStatus ?? '').trim().toLowerCase()
  if (raw.includes('archived')) return 'disqualified'

  // Kanban drag sets enrollment.stage + manual_stage_override (see PATCH /api/vinfast/enrollments).
  // Without this, vf_onboarding_status always wins and the card snaps back after refresh.
  if (input.manualStageOverride && isTeslaStage(input.enrollmentStage)) {
    return input.enrollmentStage
  }

  if (raw) {
    if (raw.includes('ready for activation')) return 'ready'
    if (raw.includes('setup, training') || raw.includes('setup, training and equipment')) return 'getting_ready'
    if (raw.includes('repairwise account setup and training')) return 'getting_ready'
    if (raw.includes('labor rate approval')) return 'not_ready'
    if (raw.includes('active') || raw.includes('onboarded') || raw.includes('ready for website bookings')) {
      return 'active'
    }
  }

  if (isTeslaStage(input.enrollmentStage)) return input.enrollmentStage
  return 'not_ready'
}

export async function listVinfastEnrollments(supabaseAdmin: SupabaseClient): Promise<VinfastEnrollmentView[]> {
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
    .eq('program_id', VINFAST_PROGRAM_ID)
    .is('unenrolled_at', null)
    .order('updated_at', { ascending: false })

  if (enrollmentsError) throw new Error(enrollmentsError.message)

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[]
  if (enrollments.length === 0) return []

  const locationIds = enrollments.map(row => row.location_id)
  const enrollmentIds = enrollments.map(row => row.id)

  const locationsData: LocationRow[] = []
  for (const ids of chunk(locationIds, BATCH_SIZE)) {
    const { data, error } = await activeLocations(
      supabaseAdmin,
      'id, name, city, state, county, status, vf_onboarding_status, vf_operational_status, capabilities_submitted_at, account_id, motherduck_shop_id',
    ).in('id', ids)
    if (error) throw new Error(error.message)
    locationsData.push(...((data ?? []) as LocationRow[]))
  }

  const checklistData: ChecklistRow[] = []
  for (const ids of chunk(enrollmentIds, BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from('program_enrollment_checklist')
      .select('enrollment_id, item_key, completed_at, notes')
      .in('enrollment_id', ids)
    if (error) throw new Error(error.message)
    checklistData.push(...((data ?? []) as ChecklistRow[]))
  }

  const accountIds = Array.from(
    new Set(locationsData.map(row => row.account_id).filter((id): id is string => Boolean(id))),
  )
  const { data: accountsData, error: accountsError } = accountIds.length
    ? await supabaseAdmin.from('accounts').select('id, business_name').in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw new Error(accountsError.message)

  const { data: surveyRowsData, error: surveyError } = await supabaseAdmin
    .from('tech_competency_surveys')
    .select('location_id')
    .in('location_id', locationIds)
  if (surveyError) throw new Error(surveyError.message)

  const cacheKeys = Array.from(
    new Set(
      locationsData
        .map(row => row.motherduck_shop_id)
        .filter((id): id is string => Boolean(id))
        .concat(locationIds),
    ),
  )
  const { data: cacheData, error: cacheError } = await supabaseAdmin
    .from('shop_status_cache')
    .select('shop_id, is_vinfast_shop, is_active, max_jobs_per_day, max_jobs_per_week')
    .in('shop_id', cacheKeys)
  if (cacheError) throw new Error(cacheError.message)

  const checklistRows = (checklistData ?? []) as ChecklistRow[]
  const checklistByEnrollment = new Map<string, ChecklistRow[]>()
  for (const row of checklistRows) {
    const list = checklistByEnrollment.get(row.enrollment_id) ?? []
    list.push(row)
    checklistByEnrollment.set(row.enrollment_id, list)
  }

  const locationById = new Map((locationsData ?? []).map(row => [row.id as string, row as LocationRow]))
  const accountById = new Map((accountsData ?? []).map(row => [row.id as string, row as AccountRow]))
  const surveyCountByLocation = new Map<string, number>()
  for (const row of (surveyRowsData ?? []) as TechSurveyRow[]) {
    surveyCountByLocation.set(row.location_id, (surveyCountByLocation.get(row.location_id) ?? 0) + 1)
  }
  const cacheByShopId = new Map((cacheData ?? []).map(row => [row.shop_id as string, row as ShopStatusCacheRow]))
  const config = getProgramConfig(VINFAST_PROGRAM_ID)
  const checklistDef = config?.checklist ?? []

  return enrollments.map(enrollment => {
    const loc = locationById.get(enrollment.location_id)
    const rows = checklistByEnrollment.get(enrollment.id) ?? []
    const rowsByKey = new Map(rows.map(row => [row.item_key, row]))

    const checklist = checklistDef.map(item => {
      const row = rowForCanonicalKey(item.key, rowsByKey as Map<string, VinfastChecklistRow>)
      return {
        itemKey: item.key,
        label: item.label,
        completedAt: row?.completed_at ?? null,
        notes: row?.notes ?? null,
      }
    })

    const canonicalCompletedKeys = checklistDef
      .filter(def => Boolean(rowForCanonicalKey(def.key, rowsByKey as Map<string, VinfastChecklistRow>)?.completed_at))
      .map(def => def.key)

    const normalizedStage = normalizeVinfastStage({
      locationStatus: loc?.status,
      vfOnboardingStatus: loc?.vf_onboarding_status,
      enrollmentStage: enrollment.stage,
      manualStageOverride: enrollment.manual_stage_override,
    })

    return {
      id: enrollment.id,
      locationId: enrollment.location_id,
      locationName: (loc?.name as string) ?? '',
      city: (loc?.city as string | null) ?? null,
      state: (loc?.state as string | null) ?? null,
      county: (loc?.county as string | null) ?? null,
      accountName: (loc?.account_id ? accountById.get(loc.account_id)?.business_name : null) ?? null,
      stage: normalizedStage,
      tier: (enrollment.tier as 'generalist' | 'specialist' | null) ?? null,
      manualStageOverride: enrollment.manual_stage_override,
      lastTouchedAt: enrollment.last_touched_at,
      firstJobCompletedAt: enrollment.first_job_completed_at,
      hasShopSurvey: Boolean(loc?.capabilities_submitted_at),
      hasTechSurvey: (surveyCountByLocation.get(enrollment.location_id) ?? 0) > 0,
      vinfastActive: Boolean(
        (() => {
          const key = loc?.motherduck_shop_id ?? enrollment.location_id
          const cache = cacheByShopId.get(key)
          return (
            cache?.is_vinfast_shop &&
            cache?.is_active &&
            (cache.max_jobs_per_day ?? 0) > 0 &&
            (cache.max_jobs_per_week ?? 0) > 0
          )
        })(),
      ),
      checklist,
      missingChecklistKeys: getMissingChecklistKeys(VINFAST_PROGRAM_ID, canonicalCompletedKeys),
      vfOperationalStatus: (loc?.vf_operational_status as string | null) ?? null,
      vfOnboardingStatus: (loc?.vf_onboarding_status as string | null) ?? null,
    }
  })
}
