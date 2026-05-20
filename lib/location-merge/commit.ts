import type { SupabaseClient } from '@supabase/supabase-js'
import { findDuplicateContactIds, type ContactRow } from '@/lib/location-merge/contacts'
import { buildLocationMergePreview, assertValidMergeIds } from '@/lib/location-merge/preview'
import {
  legacyStatusRank,
  mergeChecklistByItemKey,
  pickEnrollmentStage,
  stageRank,
  type ChecklistRow,
  type LegacyEnrollmentRow,
  type ProgramEnrollmentRow,
} from '@/lib/location-merge/programs'
import { mergedLocationPatch } from '@/lib/location-merge/resolve'
import { fetchMergeableColumns } from '@/lib/location-merge/schema'
import type { MergeCommitBody } from '@/lib/location-merge/types'

export async function commitLocationMerge(
  supabase: SupabaseClient,
  body: MergeCommitBody,
  actorEmail: string,
): Promise<{ locationId: string }> {
  assertValidMergeIds(body.primaryId, body.secondaryId)

  const preview = await buildLocationMergePreview(supabase, {
    primaryId: body.primaryId,
    secondaryId: body.secondaryId,
  })

  if (preview.warnings.requiresDisqualifiedConfirmation && !body.disqualifiedAcknowledged) {
    throw new Error('Confirm how disqualified / churned status should carry over before merging')
  }
  if (preview.relational.contracts.legalEntityWarning && !body.legalEntityAcknowledged) {
    throw new Error('Acknowledge conflicting legal entity names on contracts before merging')
  }

  if (body.previewSnapshot) {
    if (
      body.previewSnapshot.primaryUpdatedAt !== preview.primary.updatedAt ||
      body.previewSnapshot.secondaryUpdatedAt !== preview.secondary.updatedAt
    ) {
      throw new Error('One or both locations changed since preview. Refresh and try again.')
    }
  }

  const columns = await fetchMergeableColumns(supabase, 'locations')
  const [{ data: primaryRow }, { data: secondaryRow }] = await Promise.all([
    supabase.from('locations').select('*').eq('id', body.primaryId).single(),
    supabase.from('locations').select('*').eq('id', body.secondaryId).single(),
  ])
  if (!primaryRow || !secondaryRow) throw new Error('Location not found')

  const patch = mergedLocationPatch(
    columns,
    primaryRow as Record<string, unknown>,
    secondaryRow as Record<string, unknown>,
    body.fieldOverrides ?? {},
  )
  patch.updated_at = new Date().toISOString()

  const { error: updatePrimaryError } = await supabase
    .from('locations')
    .update(patch)
    .eq('id', body.primaryId)
  if (updatePrimaryError) throw new Error(updatePrimaryError.message)

  const { data: primaryContacts } = await supabase
    .from('contacts')
    .select('id, location_id, account_id, name, email, phone')
    .eq('location_id', body.primaryId)
  const { data: secondaryContacts } = await supabase
    .from('contacts')
    .select('id, location_id, account_id, name, email, phone')
    .eq('location_id', body.secondaryId)

  const dupContactIds = findDuplicateContactIds(
    (primaryContacts ?? []) as ContactRow[],
    (secondaryContacts ?? []) as ContactRow[],
  )
  if (dupContactIds.length > 0) {
    await supabase.from('contacts').delete().in('id', dupContactIds)
  }
  await supabase.from('contacts').update({ location_id: body.primaryId }).eq('location_id', body.secondaryId)

  const { data: secondaryContractLinks } = await supabase
    .from('contract_locations')
    .select('contract_id')
    .eq('location_id', body.secondaryId)
  const { data: primaryContractLinks } = await supabase
    .from('contract_locations')
    .select('contract_id')
    .eq('location_id', body.primaryId)
  const primaryContractIds = new Set((primaryContractLinks ?? []).map(r => r.contract_id as string))

  for (const link of secondaryContractLinks ?? []) {
    const contractId = link.contract_id as string
    if (primaryContractIds.has(contractId)) {
      await supabase
        .from('contract_locations')
        .delete()
        .eq('location_id', body.secondaryId)
        .eq('contract_id', contractId)
    } else {
      await supabase
        .from('contract_locations')
        .update({ location_id: body.primaryId })
        .eq('location_id', body.secondaryId)
        .eq('contract_id', contractId)
    }
  }

  await supabase.from('activity_log').update({ location_id: body.primaryId }).eq('location_id', body.secondaryId)

  const { data: openSecondaryTasks } = await supabase
    .from('tasks')
    .select('id, title, program_context, status')
    .eq('location_id', body.secondaryId)
    .neq('status', 'done')
  const { data: openPrimaryTasks } = await supabase
    .from('tasks')
    .select('id, title, program_context')
    .eq('location_id', body.primaryId)
    .neq('status', 'done')
  const primaryTaskKeys = new Set(
    (openPrimaryTasks ?? []).map(
      (t: { title: string; program_context: string | null }) =>
        `${(t.title ?? '').trim().toLowerCase()}|${t.program_context ?? ''}`,
    ),
  )
  const taskIdsToDrop: string[] = []
  const taskIdsToMove: string[] = []
  for (const t of openSecondaryTasks ?? []) {
    const key = `${(t.title ?? '').trim().toLowerCase()}|${(t as { program_context: string | null }).program_context ?? ''}`
    if (primaryTaskKeys.has(key)) taskIdsToDrop.push(t.id as string)
    else taskIdsToMove.push(t.id as string)
  }
  if (taskIdsToDrop.length > 0) await supabase.from('tasks').delete().in('id', taskIdsToDrop)
  if (taskIdsToMove.length > 0) {
    await supabase.from('tasks').update({ location_id: body.primaryId }).in('id', taskIdsToMove)
  }
  await supabase.from('tasks').update({ location_id: body.primaryId }).eq('location_id', body.secondaryId).eq('status', 'done')

  await mergeProgramEnrollments(supabase, body)
  await mergeLegacyProgramEnrollments(supabase, body)

  await mergeLocationEnrichment(supabase, body.primaryId, body.secondaryId)
  await supabase.from('tech_competency_surveys').update({ location_id: body.primaryId }).eq('location_id', body.secondaryId)
  await supabase.from('shop_approved_contacts').update({ shop_id: body.primaryId }).eq('shop_id', body.secondaryId)
  await supabase.from('consult_cases').update({ shop_id: body.primaryId }).eq('shop_id', body.secondaryId)

  const { data: primaryCache } = await supabase
    .from('shop_status_cache')
    .select('shop_id')
    .eq('shop_id', body.primaryId)
    .maybeSingle()
  if (!primaryCache) {
    await supabase
      .from('shop_status_cache')
      .update({ shop_id: body.primaryId })
      .eq('shop_id', body.secondaryId)
  } else {
    await supabase.from('shop_status_cache').delete().eq('shop_id', body.secondaryId)
  }

  const mergedAt = new Date().toISOString()
  const { error: softDeleteError } = await supabase
    .from('locations')
    .update({
      merged_into: body.primaryId,
      deleted_at: mergedAt,
      updated_at: mergedAt,
    })
    .eq('id', body.secondaryId)
  if (softDeleteError) throw new Error(softDeleteError.message)

  const contactCount = (primaryContacts?.length ?? 0) + (secondaryContacts?.length ?? 0) - dupContactIds.length
  const activityCount = preview.relational.activityEntries
  const taskMoved = taskIdsToMove.length + (preview.relational.openTasks - taskIdsToDrop.length)

  await supabase.from('activity_log').insert({
    location_id: body.primaryId,
    type: 'note',
    subject: 'Location merge',
    body: `Merged with ${secondaryRow.name} (${body.secondaryId}) by ${actorEmail} on ${mergedAt.slice(0, 10)}. Combined: ${contactCount} contacts, ${activityCount} activity entries, ${taskMoved} open tasks.`,
    sent_by: actorEmail,
  })

  return { locationId: body.primaryId }
}

async function mergeLocationEnrichment(
  supabase: SupabaseClient,
  primaryId: string,
  secondaryId: string,
) {
  const enrichCols = await fetchMergeableColumns(supabase, 'location_enrichment', ['location_id'])
  const { data: pri } = await supabase.from('location_enrichment').select('*').eq('location_id', primaryId).maybeSingle()
  const { data: sec } = await supabase.from('location_enrichment').select('*').eq('location_id', secondaryId).maybeSingle()
  if (!sec) return
  if (!pri) {
    await supabase.from('location_enrichment').update({ location_id: primaryId }).eq('location_id', secondaryId)
    return
  }
  const patch = mergedLocationPatch(
    enrichCols,
    pri as Record<string, unknown>,
    sec as Record<string, unknown>,
  )
  await supabase.from('location_enrichment').update(patch).eq('location_id', primaryId)
  await supabase.from('location_enrichment').delete().eq('location_id', secondaryId)
}

async function mergeProgramEnrollments(supabase: SupabaseClient, body: MergeCommitBody) {
  const { data: primaryEnrollments } = await supabase
    .from('location_program_enrollments')
    .select('id, location_id, program_id, stage, manual_stage_override, first_job_completed_at, tier, unenrolled_at')
    .eq('location_id', body.primaryId)
    .is('unenrolled_at', null)
  const { data: secondaryEnrollments } = await supabase
    .from('location_program_enrollments')
    .select('id, location_id, program_id, stage, manual_stage_override, first_job_completed_at, tier, unenrolled_at')
    .eq('location_id', body.secondaryId)
    .is('unenrolled_at', null)

  const priList = (primaryEnrollments ?? []) as (ProgramEnrollmentRow & {
    manual_stage_override?: boolean
    first_job_completed_at?: string | null
    tier?: string | null
  })[]
  const secList = (secondaryEnrollments ?? []) as (ProgramEnrollmentRow & {
    manual_stage_override?: boolean
    first_job_completed_at?: string | null
    tier?: string | null
  })[]
  const programOverride = new Map((body.programOverrides ?? []).map(o => [o.program, o]))

  for (const sec of secList) {
    const pri = priList.find(p => p.program_id === sec.program_id)
    const override = programOverride.get(sec.program_id)
    if (!pri) {
      await supabase
        .from('location_program_enrollments')
        .update({ location_id: body.primaryId })
        .eq('id', sec.id)
      continue
    }

    const useSecondary = override?.enrollment === 'secondary'
    const source = useSecondary ? sec : pri
    const other = useSecondary ? pri : sec

    const { data: priChecklist } = await supabase
      .from('program_enrollment_checklist')
      .select('enrollment_id, item_key, completed_at, completed_by_user_id, notes')
      .eq('enrollment_id', pri.id)
    const { data: secChecklist } = await supabase
      .from('program_enrollment_checklist')
      .select('enrollment_id, item_key, completed_at, completed_by_user_id, notes')
      .eq('enrollment_id', sec.id)

    const { merged } = mergeChecklistByItemKey(
      (priChecklist ?? []) as ChecklistRow[],
      (secChecklist ?? []) as ChecklistRow[],
    )

    for (const [itemKey, row] of merged) {
      const flatOverride = override?.checklistFieldOverrides?.[itemKey]
      const patch: Record<string, unknown> = {
        enrollment_id: pri.id,
        item_key: itemKey,
        completed_at: row.completed_at ?? null,
        completed_by_user_id: row.completed_by_user_id ?? null,
        notes: row.notes ?? null,
      }
      if (flatOverride) Object.assign(patch, flatOverride)
      await supabase.from('program_enrollment_checklist').upsert(patch, {
        onConflict: 'enrollment_id,item_key',
      })
    }

    await supabase
      .from('location_program_enrollments')
      .update({
        stage: useSecondary ? sec.stage : pickEnrollmentStage(pri.stage, sec.stage),
        manual_stage_override: Boolean(source.manual_stage_override) || Boolean(other.manual_stage_override),
        first_job_completed_at: source.first_job_completed_at ?? other.first_job_completed_at ?? null,
        tier: source.tier ?? other.tier ?? null,
        last_touched_at: new Date().toISOString(),
      })
      .eq('id', pri.id)

    await supabase
      .from('location_program_enrollments')
      .update({ unenrolled_at: new Date().toISOString() })
      .eq('id', sec.id)
  }
}

async function mergeLegacyProgramEnrollments(supabase: SupabaseClient, body: MergeCommitBody) {
  const { data: primaryRows } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('location_id', body.primaryId)
  const { data: secondaryRows } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('location_id', body.secondaryId)

  const priList = (primaryRows ?? []) as LegacyEnrollmentRow[]
  for (const sec of (secondaryRows ?? []) as LegacyEnrollmentRow[]) {
    const pri = priList.find(p => p.program === sec.program)
    if (!pri) {
      await supabase.from('program_enrollments').update({ location_id: body.primaryId }).eq('id', sec.id)
      continue
    }
    const nextStatus =
      legacyStatusRank(pri.status) >= legacyStatusRank(sec.status) ? pri.status : sec.status
    await supabase.from('program_enrollments').update({ status: nextStatus }).eq('id', pri.id)
    await supabase.from('program_enrollments').delete().eq('id', sec.id)
  }
}
