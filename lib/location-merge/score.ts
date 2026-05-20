import type { MergeColumnMeta, LocationMergeScore } from '@/lib/location-merge/types'
import { isPopulatedValue } from '@/lib/location-merge/values'

export function countPopulatedFields(
  columns: MergeColumnMeta[],
  row: Record<string, unknown>,
): number {
  let n = 0
  for (const col of columns) {
    if (isPopulatedValue(row[col.column_name])) n++
  }
  return n
}

export function buildLocationScore(input: {
  columns: MergeColumnMeta[]
  row: Record<string, unknown>
  contacts: number
  contracts: number
  programEnrollments: number
  checklistFields: number
}): LocationMergeScore {
  const fieldScore = countPopulatedFields(input.columns, input.row)
  return {
    fieldScore,
    contacts: input.contacts,
    contracts: input.contracts,
    programEnrollments: input.programEnrollments,
    checklistFields: input.checklistFields,
    total: fieldScore + input.contacts + input.contracts + input.programEnrollments + input.checklistFields,
  }
}

export function pickPrimaryByScore(
  primary: { id: string; score: LocationMergeScore; createdAt: string },
  secondary: { id: string; score: LocationMergeScore; createdAt: string },
): { primaryId: string; secondaryId: string; reason: string } {
  if (primary.score.total > secondary.score.total) {
    return {
      primaryId: primary.id,
      secondaryId: secondary.id,
      reason: `Primary has ${primary.score.total} populated fields/relations vs ${secondary.score.total}`,
    }
  }
  if (secondary.score.total > primary.score.total) {
    return {
      primaryId: secondary.id,
      secondaryId: primary.id,
      reason: `Primary has ${secondary.score.total} populated fields/relations vs ${primary.score.total}`,
    }
  }
  const primaryOlder = new Date(primary.createdAt).getTime() <= new Date(secondary.createdAt).getTime()
  if (primaryOlder) {
    return {
      primaryId: primary.id,
      secondaryId: secondary.id,
      reason: `Tied at ${primary.score.total} each; primary is older (created first)`,
    }
  }
  return {
    primaryId: secondary.id,
    secondaryId: primary.id,
    reason: `Tied at ${primary.score.total} each; primary is older (created first)`,
  }
}
