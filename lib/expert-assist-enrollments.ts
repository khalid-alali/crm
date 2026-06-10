import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checklistCompletedAtFromActivation,
  isExpertAssistChecklistItemReadOnly,
} from '@/lib/activation/checklist'
import type { ActivationStateRow } from '@/lib/activation/types'
import { isActivationStage } from '@/lib/activation/stages'
import { activeLocations } from '@/lib/locations-active'
import {
  deriveExpertAssistFunnelStage,
  isExpertAssistFunnelStage,
  isSignupComplete,
  type ExpertAssistFunnelStage,
} from '@/lib/expert-assist-funnel/stages'
import { deriveExpertAssistNextAction } from '@/lib/expert-assist-funnel/next-action'
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
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  county: string | null
  account_id: string | null
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_invited_at: string | null
  consult_first_free_used_at: string | null
  consult_service_writer_contact_id: string | null
  consult_stripe_payment_method_id: string | null
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

export type ExpertAssistChecklistItemView = {
  itemKey: string
  label: string
  completedAt: string | null
  notes: string | null
  readOnly?: boolean
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
  enrolledAt: string | null
  consultInvitedAt: string | null
  signupComplete: boolean
  hasInboundSms: boolean
  closedConsultCount: number
  firstClosedAt: string | null
  secondClosedAt: string | null
  lastClosedAt: string | null
  checklist: ExpertAssistChecklistItemView[]
}

export type ExpertAssistShopProgramView = ExpertAssistEnrollmentView & {
  address: string | null
  ownerName: string | null
  serviceAdvisorContact: string | null
  daysSinceSignup: number | null
  daysSinceLastActivity: number | null
  daysSinceLastConsult: number | null
  uniqueQrScanCount: number
  freeConsultUsedAt: string | null
  nextAction: string
  firstInboundSms: boolean
  firstConsultComplete: boolean
  secondConsultComplete: boolean
}

function formatLocationAddress(loc: LocationRow | undefined): string | null {
  if (!loc) return null
  const parts = [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function daysSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null
  return Math.floor((nowMs - ts) / (24 * 60 * 60 * 1000))
}

function buildEnrollmentView(input: {
  enrollment: EnrollmentRow
  loc: LocationRow | undefined
  accountName: string | null
  checklistRows: ChecklistRow[]
  activationState: ActivationStateRow | null
  closedStats: {
    count: number
    firstClosedAt: string | null
    secondClosedAt: string | null
    lastClosedAt: string | null
  }
  hasInboundSms: boolean
  checklistDef: { key: string; label: string }[]
}): ExpertAssistEnrollmentView {
  const rowsByKey = new Map(input.checklistRows.map(row => [row.item_key, row]))
  const freeConsultUsedAt = input.loc?.consult_first_free_used_at ?? null
  const hasCardOnFile = Boolean(input.loc?.consult_stripe_payment_method_id?.trim())

  const checklist = input.checklistDef.map(item => {
    const row = rowsByKey.get(item.key)
    const fromActivation = checklistCompletedAtFromActivation(item.key, input.activationState, {
      hasCardOnFile,
      freeConsultUsedAt,
    })
    let completedAt = fromActivation ?? row?.completed_at ?? null
    if (item.key === 'card_on_file' && hasCardOnFile && !completedAt) {
      completedAt =
        input.activationState?.card_added_at ??
        input.activationState?.signed_up_at ??
        input.enrollment.created_at
    }
    return {
      itemKey: item.key,
      label: item.label,
      completedAt,
      notes: row?.notes ?? null,
      readOnly: isExpertAssistChecklistItemReadOnly(item.key, { hasCardOnFile }),
    }
  })

  const signupComplete = isSignupComplete({
    consultBillingStatus: input.loc?.consult_billing_status,
    consultEnabled: input.loc?.consult_enabled,
  })

  const derivedStage = deriveExpertAssistFunnelStage(
    {
      signupComplete,
      hasInboundSms: input.hasInboundSms,
      closedConsultCount: input.closedStats.count,
      firstClosedAt: input.closedStats.firstClosedAt,
      secondClosedAt: input.closedStats.secondClosedAt,
      lastClosedAt: input.closedStats.lastClosedAt,
    },
    {
      manualStageOverride: false,
      storedStage: undefined,
    },
  )

  const activationStage =
    input.activationState && isActivationStage(input.activationState.stage) ?
      input.activationState.stage
    : derivedStage

  const stage: ExpertAssistFunnelStage =
    input.enrollment.manual_stage_override && isExpertAssistFunnelStage(input.enrollment.stage) ?
      input.enrollment.stage
    : activationStage

  return {
    id: input.enrollment.id,
    locationId: input.enrollment.location_id,
    locationName: input.loc?.name ?? '',
    city: input.loc?.city ?? null,
    state: input.loc?.state ?? null,
    county: input.loc?.county ?? null,
    accountName: input.accountName,
    stage,
    manualStageOverride: input.enrollment.manual_stage_override,
    lastTouchedAt: input.enrollment.last_touched_at,
    enrolledAt: input.enrollment.created_at,
    consultInvitedAt: input.loc?.consult_invited_at ?? null,
    signupComplete,
    hasInboundSms: input.hasInboundSms,
    closedConsultCount: input.closedStats.count,
    firstClosedAt: input.closedStats.firstClosedAt,
    secondClosedAt: input.closedStats.secondClosedAt,
    lastClosedAt: input.closedStats.lastClosedAt,
    checklist,
  }
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
      'id, name, address_line1, city, state, postal_code, county, account_id, consult_enabled, consult_billing_status, consult_invited_at, consult_first_free_used_at, consult_service_writer_contact_id, consult_stripe_payment_method_id',
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

  const activationByLocation = new Map<string, ActivationStateRow>()
  for (const ids of chunk(locationIds, BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin.from('activation_state').select('*').in('location_id', ids)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as ActivationStateRow[]) {
      activationByLocation.set(row.location_id, row)
    }
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
    const closedStats = closedByShop.get(enrollment.location_id) ?? {
      count: 0,
      firstClosedAt: null,
      secondClosedAt: null,
      lastClosedAt: null,
    }

    return buildEnrollmentView({
      enrollment,
      loc,
      accountName: (loc?.account_id ? accountById.get(loc.account_id)?.business_name : null) ?? null,
      checklistRows: rows,
      activationState: activationByLocation.get(enrollment.location_id) ?? null,
      closedStats,
      hasInboundSms: inboundSmsShopIds.has(enrollment.location_id),
      checklistDef,
    })
  })
}

type ServiceWriterRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

function formatServiceAdvisorContact(contact: ServiceWriterRow | null | undefined): string | null {
  if (!contact?.name?.trim()) return null
  const parts = [contact.name.trim()]
  if (contact.phone?.trim()) parts.push(contact.phone.trim())
  if (contact.email?.trim()) parts.push(contact.email.trim())
  return parts.join(' · ')
}

export async function getExpertAssistShopProgramView(
  supabaseAdmin: SupabaseClient,
  locationId: string,
  opts?: { ownerName?: string | null; nowMs?: number },
): Promise<ExpertAssistShopProgramView | null> {
  const { data: enrollment, error: enrollmentError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select(
      'id, location_id, program_id, stage, manual_stage_override, last_touched_at, created_at, updated_at',
    )
    .eq('location_id', locationId)
    .eq('program_id', EXPERT_ASSIST_PROGRAM_ID)
    .is('unenrolled_at', null)
    .maybeSingle()

  if (enrollmentError) throw new Error(enrollmentError.message)
  if (!enrollment) return null

  const { data: loc, error: locError } = await activeLocations(
    supabaseAdmin,
    'id, name, address_line1, city, state, postal_code, county, account_id, consult_enabled, consult_billing_status, consult_invited_at, consult_first_free_used_at, consult_service_writer_contact_id, consult_stripe_payment_method_id',
  )
    .eq('id', locationId)
    .maybeSingle()

  if (locError) throw new Error(locError.message)
  const location = (loc as LocationRow | null) ?? undefined

  const { data: checklistRows, error: checklistError } = await supabaseAdmin
    .from('program_enrollment_checklist')
    .select('enrollment_id, item_key, completed_at, notes')
    .eq('enrollment_id', enrollment.id)

  if (checklistError) throw new Error(checklistError.message)

  const { data: activationRow, error: activationError } = await supabaseAdmin
    .from('activation_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle()

  if (activationError) throw new Error(activationError.message)

  const { data: closedCases, error: casesError } = await supabaseAdmin
    .from('consult_cases')
    .select('shop_id, closed_at, created_at, updated_at')
    .eq('shop_id', locationId)
    .eq('status', 'closed')
    .not('closed_at', 'is', null)

  if (casesError) throw new Error(casesError.message)

  const { data: openCases, error: openCasesError } = await supabaseAdmin
    .from('consult_cases')
    .select('created_at, updated_at')
    .eq('shop_id', locationId)
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (openCasesError) throw new Error(openCasesError.message)

  const inboundSmsShopIds = await loadInboundSmsShopIds(supabaseAdmin, [locationId])
  const closedStats = buildClosedConsultStats((closedCases ?? []) as ClosedCaseRow[]).get(locationId) ?? {
    count: 0,
    firstClosedAt: null,
    secondClosedAt: null,
    lastClosedAt: null,
  }

  let accountName: string | null = null
  if (location?.account_id) {
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('business_name')
      .eq('id', location.account_id)
      .maybeSingle()
    accountName = (account as { business_name: string | null } | null)?.business_name ?? null
  }

  let serviceWriter: ServiceWriterRow | null = null
  if (location?.consult_service_writer_contact_id) {
    const { data: sw, error: swError } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, phone')
      .eq('id', location.consult_service_writer_contact_id)
      .maybeSingle()
    if (swError) throw new Error(swError.message)
    serviceWriter = sw as ServiceWriterRow | null
  }

  const config = getProgramConfig(EXPERT_ASSIST_PROGRAM_ID)
  const checklistDef = config?.checklist ?? []
  const base = buildEnrollmentView({
    enrollment: enrollment as EnrollmentRow,
    loc: location,
    accountName,
    checklistRows: (checklistRows ?? []) as ChecklistRow[],
    activationState: (activationRow as ActivationStateRow | null) ?? null,
    closedStats,
    hasInboundSms: inboundSmsShopIds.has(locationId),
    checklistDef,
  })

  const nowMs = opts?.nowMs ?? Date.now()
  const signupAnchor = base.signupComplete ? base.enrolledAt : null
  const lastActivityCandidates = [
    base.lastTouchedAt,
    closedStats.lastClosedAt,
    ...(openCases ?? []).map(row => (row as { updated_at?: string | null }).updated_at ?? null),
    ...(closedCases ?? []).map(row => (row as { updated_at?: string | null }).updated_at ?? null),
  ].filter((value): value is string => Boolean(value))

  const lastActivityAt =
    lastActivityCandidates.length > 0
      ? lastActivityCandidates.reduce((latest, value) =>
          Date.parse(value) > Date.parse(latest) ? value : latest,
        )
      : null

  const activation = (activationRow as ActivationStateRow | null) ?? null
  const uniqueQrScanCount = activation?.qr_scan_count ?? (base.checklist.find(item => item.itemKey === 'qr_scanned')?.completedAt ? 1 : 0)

  return {
    ...base,
    address: formatLocationAddress(location),
    ownerName: opts?.ownerName?.trim() || accountName,
    serviceAdvisorContact: formatServiceAdvisorContact(serviceWriter),
    daysSinceSignup: daysSinceIso(signupAnchor, nowMs),
    daysSinceLastActivity: daysSinceIso(lastActivityAt, nowMs),
    daysSinceLastConsult: daysSinceIso(closedStats.lastClosedAt, nowMs),
    uniqueQrScanCount,
    freeConsultUsedAt: location?.consult_first_free_used_at ?? null,
    firstInboundSms: base.hasInboundSms,
    firstConsultComplete: Boolean(closedStats.firstClosedAt),
    secondConsultComplete: Boolean(closedStats.secondClosedAt),
    nextAction: deriveExpertAssistNextAction({
      stage: base.stage,
      signupComplete: base.signupComplete,
      hasInboundSms: base.hasInboundSms,
      closedConsultCount: base.closedConsultCount,
      checklist: base.checklist,
      activationState: activation,
    }),
  }
}
