import type { SupabaseClient } from '@supabase/supabase-js'
import { activeLocations } from '@/lib/locations-active'
import {
  deriveExpertAssistFunnelStage,
  isExpertAssistFunnelStage,
  isSignupComplete,
  type ExpertAssistFunnelStage,
} from '@/lib/expert-assist-funnel/stages'
import { FREE_CONSULT_CHECKLIST_KEY } from '@/lib/expert-assist/free-consult'
import { EXPERT_ASSIST_PROGRAM_ID, getProgramConfig } from '@/lib/program-config'

type EnrollmentRow = {
  id: string
  location_id: string
  program_id: string
  stage: string
  manual_stage_override: boolean
  last_touched_at: string | null
  created_at: string
  updated_at: string
}

type LocationRow = {
  id: string
  name: string
  city: string | null
  state: string | null
  county: string | null
  account_id: string | null
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_invited_at: string | null
  consult_first_free_used_at: string | null
}

type ChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
  notes: string | null
}

type ClosedCaseRow = {
  shop_id: string
  closed_at: string | null
}

type AccountRow = {
  id: string
  business_name: string | null
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

export type ExpertAssistEnrollmentView = {
  id: string
  locationId: string
  locationName: string
  city: string | null
  state: string | null
  county: string | null
  accountName: string | null
  stage: ExpertAssistFunnelStage
  manualStageOverride: boolean
  lastTouchedAt: string | null
  consultInvitedAt: string | null
  signupComplete: boolean
  hasInboundSms: boolean
  closedConsultCount: number
  checklist: {
    itemKey: string
    label: string
    completedAt: string | null
    notes: string | null
    readOnly?: boolean
  }[]
}

async function loadInboundSmsShopIds(
  supabaseAdmin: SupabaseClient,
  locationIds: string[],
): Promise<Set<string>> {
  if (locationIds.length === 0) return new Set()

  const shopIds = new Set<string>()
  for (const ids of chunk(locationIds, BATCH_SIZE)) {
    const { data: cases, error: casesError } = await supabaseAdmin
      .from('consult_cases')
      .select('id, shop_id')
      .in('shop_id', ids)
    if (casesError) throw new Error(casesError.message)

    const caseRows = (cases ?? []) as { id: string; shop_id: string | null }[]
    if (caseRows.length === 0) continue

    const caseIds = caseRows.map(c => c.id)
    const caseShopById = new Map(caseRows.map(c => [c.id, c.shop_id]))

    for (const caseIdChunk of chunk(caseIds, BATCH_SIZE)) {
      const { data: messages, error: msgError } = await supabaseAdmin
        .from('consult_messages')
        .select('case_id')
        .in('case_id', caseIdChunk)
        .eq('direction', 'inbound')
        .limit(10000)
      if (msgError) throw new Error(msgError.message)

      for (const row of messages ?? []) {
        const shopId = caseShopById.get((row as { case_id: string }).case_id)
        if (shopId) shopIds.add(shopId)
      }
    }
  }

  return shopIds
}

function buildClosedConsultStats(
  rows: ClosedCaseRow[],
): Map<string, { count: number; firstClosedAt: string | null; secondClosedAt: string | null; lastClosedAt: string | null }> {
  const byShop = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.shop_id || !row.closed_at) continue
    const list = byShop.get(row.shop_id) ?? []
    list.push(row.closed_at)
    byShop.set(row.shop_id, list)
  }

  const out = new Map<
    string,
    { count: number; firstClosedAt: string | null; secondClosedAt: string | null; lastClosedAt: string | null }
  >()

  for (const [shopId, dates] of byShop) {
    const sorted = [...dates].sort((a, b) => Date.parse(a) - Date.parse(b))
    out.set(shopId, {
      count: sorted.length,
      firstClosedAt: sorted[0] ?? null,
      secondClosedAt: sorted[1] ?? null,
      lastClosedAt: sorted[sorted.length - 1] ?? null,
    })
  }

  return out
}

export async function listExpertAssistEnrollments(
  supabaseAdmin: SupabaseClient,
): Promise<ExpertAssistEnrollmentView[]> {
  const { data: enrollmentsData, error: enrollmentsError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select(
      `
      id,
      location_id,
      program_id,
      stage,
      manual_stage_override,
      last_touched_at,
      created_at,
      updated_at
    `,
    )
    .eq('program_id', EXPERT_ASSIST_PROGRAM_ID)
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
      'id, name, city, state, county, account_id, consult_enabled, consult_billing_status, consult_invited_at, consult_first_free_used_at',
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

  const closedCases: ClosedCaseRow[] = []
  for (const ids of chunk(locationIds, BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from('consult_cases')
      .select('shop_id, closed_at')
      .in('shop_id', ids)
      .eq('status', 'closed')
      .not('closed_at', 'is', null)
    if (error) throw new Error(error.message)
    closedCases.push(...((data ?? []) as ClosedCaseRow[]))
  }

  const accountIds = Array.from(
    new Set(locationsData.map(row => row.account_id).filter((id): id is string => Boolean(id))),
  )
  const { data: accountsData, error: accountsError } = accountIds.length
    ? await supabaseAdmin.from('accounts').select('id, business_name').in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw new Error(accountsError.message)

  const inboundSmsShopIds = await loadInboundSmsShopIds(supabaseAdmin, locationIds)
  const closedByShop = buildClosedConsultStats(closedCases)

  const checklistByEnrollment = new Map<string, ChecklistRow[]>()
  for (const row of checklistData) {
    const list = checklistByEnrollment.get(row.enrollment_id) ?? []
    list.push(row)
    checklistByEnrollment.set(row.enrollment_id, list)
  }

  const locationById = new Map(locationsData.map(row => [row.id, row]))
  const accountById = new Map((accountsData ?? []).map(row => [row.id as string, row as AccountRow]))
  const config = getProgramConfig(EXPERT_ASSIST_PROGRAM_ID)
  const checklistDef = config?.checklist ?? []

  return enrollments.map(enrollment => {
    const loc = locationById.get(enrollment.location_id)
    const rows = checklistByEnrollment.get(enrollment.id) ?? []
    const rowsByKey = new Map(rows.map(row => [row.item_key, row]))

    const freeConsultUsedAt = loc?.consult_first_free_used_at ?? null
    const checklist = checklistDef.map(item => {
      const row = rowsByKey.get(item.key)
      const completedAt =
        item.key === FREE_CONSULT_CHECKLIST_KEY
          ? freeConsultUsedAt ?? row?.completed_at ?? null
          : row?.completed_at ?? null
      return {
        itemKey: item.key,
        label: item.label,
        completedAt,
        notes: row?.notes ?? null,
        readOnly: item.key === FREE_CONSULT_CHECKLIST_KEY,
      }
    })

    const signupComplete = isSignupComplete({
      consultBillingStatus: loc?.consult_billing_status,
      consultEnabled: loc?.consult_enabled,
    })
    const closedStats = closedByShop.get(enrollment.location_id)
    const hasInboundSms = inboundSmsShopIds.has(enrollment.location_id)

    const stage = deriveExpertAssistFunnelStage(
      {
        signupComplete,
        hasInboundSms,
        closedConsultCount: closedStats?.count ?? 0,
        firstClosedAt: closedStats?.firstClosedAt ?? null,
        secondClosedAt: closedStats?.secondClosedAt ?? null,
        lastClosedAt: closedStats?.lastClosedAt ?? null,
      },
      {
        manualStageOverride: enrollment.manual_stage_override,
        storedStage: isExpertAssistFunnelStage(enrollment.stage) ? enrollment.stage : undefined,
      },
    )

    return {
      id: enrollment.id,
      locationId: enrollment.location_id,
      locationName: loc?.name ?? '',
      city: loc?.city ?? null,
      state: loc?.state ?? null,
      county: loc?.county ?? null,
      accountName: (loc?.account_id ? accountById.get(loc.account_id)?.business_name : null) ?? null,
      stage,
      manualStageOverride: enrollment.manual_stage_override,
      lastTouchedAt: enrollment.last_touched_at,
      consultInvitedAt: loc?.consult_invited_at ?? null,
      signupComplete,
      hasInboundSms,
      closedConsultCount: closedStats?.count ?? 0,
      checklist,
    }
  })
}
