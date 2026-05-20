import {
  LEGACY_PROGRAM_STATUS_RANK,
  PROGRAM_STAGE_RANK,
} from '@/lib/location-merge/constants'
import { buildFieldPreviews, resolveMergeValue } from '@/lib/location-merge/resolve'
import type { MergeColumnMeta, ProgramMergePreview } from '@/lib/location-merge/types'
import { checklistItemFieldColumns } from '@/lib/location-merge/schema'
import { isPopulatedValue } from '@/lib/location-merge/values'

export type ProgramEnrollmentRow = {
  id: string
  location_id: string
  program_id: string
  stage: string
  unenrolled_at: string | null
}

export type LegacyEnrollmentRow = {
  id: string
  location_id: string
  program: string
  status: string
}

export type ChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
  completed_by_user_id: string | null
  notes: string | null
}

const CHECKLIST_COLS = checklistItemFieldColumns()

export function stageRank(stage: string): number {
  return PROGRAM_STAGE_RANK[stage] ?? 0
}

export function legacyStatusRank(status: string): number {
  return LEGACY_PROGRAM_STATUS_RANK[status] ?? 0
}

export function countChecklistPopulated(rows: ChecklistRow[]): number {
  let n = 0
  for (const row of rows) {
    for (const col of CHECKLIST_COLS) {
      if (isPopulatedValue(row[col.column_name as keyof ChecklistRow])) n++
    }
  }
  return n
}

export function mergeChecklistByItemKey(
  primaryRows: ChecklistRow[],
  secondaryRows: ChecklistRow[],
): { previews: ProgramMergePreview['checklist']; merged: Map<string, Record<string, unknown>> } {
  const byKeyPrimary = new Map(primaryRows.map(r => [r.item_key, r]))
  const byKeySecondary = new Map(secondaryRows.map(r => [r.item_key, r]))
  const keys = new Set([...byKeyPrimary.keys(), ...byKeySecondary.keys()])
  const fields: NonNullable<ProgramMergePreview['checklist']>['fields'] = []
  const merged = new Map<string, Record<string, unknown>>()
  let conflicts = 0
  let primaryPop = 0
  let secondaryPop = 0

  for (const key of keys) {
    const pri = byKeyPrimary.get(key)
    const sec = byKeySecondary.get(key)
    const priRow = (pri ?? { item_key: key }) as Record<string, unknown>
    const secRow = (sec ?? { item_key: key }) as Record<string, unknown>
    for (const col of CHECKLIST_COLS) {
      if (isPopulatedValue(priRow[col.column_name])) primaryPop++
      if (isPopulatedValue(secRow[col.column_name])) secondaryPop++
    }
    const itemFields = buildFieldPreviews(CHECKLIST_COLS, priRow, secRow)
    for (const f of itemFields) {
      if (f.type === 'conflict') conflicts++
      fields.push({
        key: `${key}.${f.key}`,
        primary: f.primary,
        secondary: f.secondary,
        default: f.default,
        type: f.type,
      })
    }
    const rowPatch: Record<string, unknown> = { item_key: key }
    for (const col of CHECKLIST_COLS) {
      rowPatch[col.column_name] = resolveMergeValue(
        col,
        priRow[col.column_name] ?? null,
        secRow[col.column_name] ?? null,
      )
    }
    merged.set(key, rowPatch)
  }

  return {
    previews: {
      primaryFieldsPopulated: primaryPop,
      secondaryFieldsPopulated: secondaryPop,
      conflicts,
      fields,
    },
    merged,
  }
}

export function pickEnrollmentStage(a: string, b: string): string {
  return stageRank(a) >= stageRank(b) ? a : b
}
