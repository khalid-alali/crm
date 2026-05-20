import type { SupabaseClient } from '@supabase/supabase-js'
import { countContactDedupes, type ContactRow } from '@/lib/location-merge/contacts'
import { buildFieldPreviews } from '@/lib/location-merge/resolve'
import {
  countChecklistPopulated,
  mergeChecklistByItemKey,
  stageRank,
  type ChecklistRow,
  type LegacyEnrollmentRow,
  type ProgramEnrollmentRow,
} from '@/lib/location-merge/programs'
import { buildLocationScore, pickPrimaryByScore } from '@/lib/location-merge/score'
import { fetchMergeableColumns } from '@/lib/location-merge/schema'
import type { MergePreviewResponse, ProgramMergePreview } from '@/lib/location-merge/types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertValidMergeIds(primaryId: string, secondaryId: string) {
  if (!UUID_RE.test(primaryId) || !UUID_RE.test(secondaryId)) {
    throw new Error('Invalid location id')
  }
  if (primaryId === secondaryId) {
    throw new Error('Select two different locations to merge')
  }
}

async function loadLocation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from('locations').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Location not found')
  return data as Record<string, unknown> & {
    id: string
    name: string
    created_at: string
    updated_at: string
    deleted_at: string | null
    merged_into: string | null
  }
}

export async function buildLocationMergePreview(
  supabase: SupabaseClient,
  input: { primaryId: string; secondaryId: string },
): Promise<MergePreviewResponse> {
  assertValidMergeIds(input.primaryId, input.secondaryId)

  const [primaryRow, secondaryRow, columns] = await Promise.all([
    loadLocation(supabase, input.primaryId),
    loadLocation(supabase, input.secondaryId),
    fetchMergeableColumns(supabase, 'locations'),
  ])

  if (primaryRow.deleted_at) throw new Error('Primary location is no longer active')
  if (secondaryRow.merged_into) {
    const { data: into } = await supabase
      .from('locations')
      .select('name')
      .eq('id', secondaryRow.merged_into)
      .maybeSingle()
    throw new Error(
      `This location was already merged into ${into?.name ?? secondaryRow.merged_into}. Merge into that location instead.`,
    )
  }
  if (secondaryRow.deleted_at) throw new Error('Secondary location is no longer active')

  const [
    primaryContactsRes,
    secondaryContactsRes,
    primaryContractsRes,
    secondaryContractsRes,
    activityPrimaryRes,
    activitySecondaryRes,
    tasksPrimaryRes,
    tasksSecondaryRes,
    primaryEnrollmentsRes,
    secondaryEnrollmentsRes,
    primaryLegacyRes,
    secondaryLegacyRes,
  ] = await Promise.all([
    supabase.from('contacts').select('id, location_id, account_id, name, email, phone').eq('location_id', input.primaryId),
    supabase.from('contacts').select('id, location_id, account_id, name, email, phone').eq('location_id', input.secondaryId),
    supabase
      .from('contract_locations')
      .select('contract_id, contracts(legal_entity_name)')
      .eq('location_id', input.primaryId),
    supabase
      .from('contract_locations')
      .select('contract_id, contracts(legal_entity_name)')
      .eq('location_id', input.secondaryId),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('location_id', input.primaryId),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('location_id', input.secondaryId),
    supabase.from('tasks').select('id, title, status, program_context').eq('location_id', input.primaryId).neq('status', 'done'),
    supabase.from('tasks').select('id, title, status, program_context').eq('location_id', input.secondaryId).neq('status', 'done'),
    supabase
      .from('location_program_enrollments')
      .select('id, location_id, program_id, stage, unenrolled_at')
      .eq('location_id', input.primaryId)
      .is('unenrolled_at', null),
    supabase
      .from('location_program_enrollments')
      .select('id, location_id, program_id, stage, unenrolled_at')
      .eq('location_id', input.secondaryId)
      .is('unenrolled_at', null),
    supabase.from('program_enrollments').select('id, location_id, program, status').eq('location_id', input.primaryId),
    supabase.from('program_enrollments').select('id, location_id, program, status').eq('location_id', input.secondaryId),
  ])

  const primaryContacts = (primaryContactsRes.data ?? []) as ContactRow[]
  const secondaryContacts = (secondaryContactsRes.data ?? []) as ContactRow[]
  const deduped = countContactDedupes(primaryContacts, secondaryContacts)

  const primaryEnrollments = (primaryEnrollmentsRes.data ?? []) as ProgramEnrollmentRow[]
  const secondaryEnrollments = (secondaryEnrollmentsRes.data ?? []) as ProgramEnrollmentRow[]
  const enrollmentIds = [...primaryEnrollments, ...secondaryEnrollments].map(e => e.id)
  let checklistRows: ChecklistRow[] = []
  if (enrollmentIds.length > 0) {
    const { data } = await supabase
      .from('program_enrollment_checklist')
      .select('enrollment_id, item_key, completed_at, completed_by_user_id, notes')
      .in('enrollment_id', enrollmentIds)
    checklistRows = (data ?? []) as ChecklistRow[]
  }

  const primaryChecklistPop = countChecklistPopulated(
    checklistRows.filter(r => primaryEnrollments.some(e => e.id === r.enrollment_id)),
  )
  const secondaryChecklistPop = countChecklistPopulated(
    checklistRows.filter(r => secondaryEnrollments.some(e => e.id === r.enrollment_id)),
  )

  const primaryScore = buildLocationScore({
    columns,
    row: primaryRow,
    contacts: primaryContacts.length,
    contracts: (primaryContractsRes.data ?? []).length,
    programEnrollments: primaryEnrollments.length + (primaryLegacyRes.data ?? []).length,
    checklistFields: primaryChecklistPop,
  })
  const secondaryScore = buildLocationScore({
    columns,
    row: secondaryRow,
    contacts: secondaryContacts.length,
    contracts: (secondaryContractsRes.data ?? []).length,
    programEnrollments: secondaryEnrollments.length + (secondaryLegacyRes.data ?? []).length,
    checklistFields: secondaryChecklistPop,
  })

  const fields = buildFieldPreviews(columns, primaryRow, secondaryRow)

  const legalNames = new Set<string>()
  for (const side of [primaryContractsRes.data ?? [], secondaryContractsRes.data ?? []]) {
    for (const cl of side as { contracts?: { legal_entity_name?: string | null } | null }[]) {
      const n = cl.contracts?.legal_entity_name?.trim()
      if (n) legalNames.add(n)
    }
  }
  const legalEntityNames = [...legalNames]
  const legalEntityWarning = legalEntityNames.length > 1

  const openPrimary = tasksPrimaryRes.data ?? []
  const openSecondary = tasksSecondaryRes.data ?? []
  const primaryTitles = new Set(
    openPrimary.map((t: { title: string; program_context: string | null }) =>
      `${(t.title ?? '').trim().toLowerCase()}|${t.program_context ?? ''}`,
    ),
  )
  let tasksDeduped = 0
  for (const t of openSecondary as { title: string; program_context: string | null }[]) {
    const key = `${(t.title ?? '').trim().toLowerCase()}|${t.program_context ?? ''}`
    if (primaryTitles.has(key)) tasksDeduped++
  }

  const programs: ProgramMergePreview[] = []
  const programIds = new Set<string>()
  for (const e of [...primaryEnrollments, ...secondaryEnrollments]) programIds.add(e.program_id)
  for (const e of [...((primaryLegacyRes.data ?? []) as LegacyEnrollmentRow[]), ...((secondaryLegacyRes.data ?? []) as LegacyEnrollmentRow[])]) {
    programIds.add(e.program)
  }

  for (const program of programIds) {
    const pri = primaryEnrollments.find(e => e.program_id === program)
    const sec = secondaryEnrollments.find(e => e.program_id === program)
    if (pri && sec) {
      const priCheck = checklistRows.filter(r => r.enrollment_id === pri.id)
      const secCheck = checklistRows.filter(r => r.enrollment_id === sec.id)
      const { previews: checklist } = mergeChecklistByItemKey(priCheck, secCheck)
      const keepPrimary = stageRank(pri.stage) >= stageRank(sec.stage)
      programs.push({
        program,
        resolution: keepPrimary ? 'keep_primary' : 'keep_secondary',
        primaryStage: pri.stage,
        secondaryStage: sec.stage,
        checklist,
      })
    } else if (pri) {
      programs.push({ program, resolution: 'keep_primary', primaryStage: pri.stage })
    } else if (sec) {
      programs.push({ program, resolution: 'move_secondary', secondaryStage: sec.stage })
    }
  }

  const activityTotal =
    (activityPrimaryRes.count ?? 0) + (activitySecondaryRes.count ?? 0)

  const disqualifiedInvolved =
    primaryRow.status === 'inactive' ||
    secondaryRow.status === 'inactive' ||
    Boolean(primaryRow.disqualified_at) ||
    Boolean(secondaryRow.disqualified_at)

  return {
    primary: {
      id: primaryRow.id,
      name: primaryRow.name,
      score: primaryScore.total,
      updatedAt: primaryRow.updated_at,
    },
    secondary: {
      id: secondaryRow.id,
      name: secondaryRow.name,
      score: secondaryScore.total,
      updatedAt: secondaryRow.updated_at,
    },
    scoreBreakdown: { primary: primaryScore, secondary: secondaryScore },
    autoPickReason: pickPrimaryByScore(
      { id: primaryRow.id, score: primaryScore, createdAt: primaryRow.created_at },
      { id: secondaryRow.id, score: secondaryScore, createdAt: secondaryRow.created_at },
    ).reason,
    fields,
    relational: {
      contacts: { moving: secondaryContacts.length, deduped },
      contracts: {
        moving: (secondaryContractsRes.data ?? []).length,
        legalEntityWarning,
        legalEntityNames,
      },
      activityEntries: activityTotal,
      openTasks: openSecondary.length,
      openTasksDeduped: tasksDeduped,
      programs,
    },
    warnings: {
      disqualifiedInvolved,
      requiresDisqualifiedConfirmation: disqualifiedInvolved,
    },
  }
}

/** Given two location ids, auto-pick primary/secondary by score and return preview. */
export async function buildMergePreviewFromPair(
  supabase: SupabaseClient,
  locationAId: string,
  locationBId: string,
): Promise<MergePreviewResponse> {
  assertValidMergeIds(locationAId, locationBId)
  const columns = await fetchMergeableColumns(supabase, 'locations')
  const [rowA, rowB] = await Promise.all([
    loadLocation(supabase, locationAId),
    loadLocation(supabase, locationBId),
  ])

  const scoreFor = async (row: typeof rowA, otherId: string) => {
    const [contacts, contracts, enrollments, legacy, otherEnrollments] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('location_id', row.id),
      supabase.from('contract_locations').select('contract_id', { count: 'exact', head: true }).eq('location_id', row.id),
      supabase
        .from('location_program_enrollments')
        .select('id')
        .eq('location_id', row.id)
        .is('unenrolled_at', null),
      supabase.from('program_enrollments').select('id').eq('location_id', row.id),
      supabase
        .from('location_program_enrollments')
        .select('id')
        .eq('location_id', otherId)
        .is('unenrolled_at', null),
    ])
    void otherEnrollments
    return buildLocationScore({
      columns,
      row,
      contacts: contacts.count ?? 0,
      contracts: contracts.count ?? 0,
      programEnrollments: (enrollments.data?.length ?? 0) + (legacy.data?.length ?? 0),
      checklistFields: 0,
    })
  }

  const [scoreA, scoreB] = await Promise.all([scoreFor(rowA, locationBId), scoreFor(rowB, locationAId)])
  const picked = pickPrimaryByScore(
    { id: rowA.id, score: scoreA, createdAt: rowA.created_at },
    { id: rowB.id, score: scoreB, createdAt: rowB.created_at },
  )
  return buildLocationMergePreview(supabase, {
    primaryId: picked.primaryId,
    secondaryId: picked.secondaryId,
  })
}
