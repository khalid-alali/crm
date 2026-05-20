import {
  MERGE_NOTES_SEPARATOR,
  MERGE_OVERRIDES,
  NOTES_LIKE_NAME_RE,
  PIPELINE_STATUS_RANK,
} from '@/lib/location-merge/constants'
import type { MergeColumnMeta, MergeFieldPreview, MergeFieldType } from '@/lib/location-merge/types'
import { isPopulatedValue, valuesEqual } from '@/lib/location-merge/values'

function isNotesLikeColumn(col: MergeColumnMeta): boolean {
  if (col.data_type === 'text' && (col.character_maximum_length ?? 0) > 100) return true
  return NOTES_LIKE_NAME_RE.test(col.column_name)
}

function pickEarlier(a: unknown, b: unknown): unknown {
  const aPop = isPopulatedValue(a)
  const bPop = isPopulatedValue(b)
  if (!aPop && !bPop) return null
  if (aPop && !bPop) return a
  if (!aPop && bPop) return b
  const aTime = new Date(String(a)).getTime()
  const bTime = new Date(String(b)).getTime()
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return a
  return aTime <= bTime ? a : b
}

function pickPrimaryIfBoth(a: unknown, b: unknown): unknown {
  if (isPopulatedValue(a)) return a
  if (isPopulatedValue(b)) return b
  return null
}

function pickMostAdvancedStatus(a: unknown, b: unknown): unknown {
  const aStr = isPopulatedValue(a) ? String(a) : null
  const bStr = isPopulatedValue(b) ? String(b) : null
  if (!aStr && !bStr) return null
  if (!aStr) return b
  if (!bStr) return a
  const aRank = PIPELINE_STATUS_RANK[aStr] ?? 0
  const bRank = PIPELINE_STATUS_RANK[bStr] ?? 0
  return aRank >= bRank ? a : b
}

function concatenateNotes(a: unknown, b: unknown): unknown {
  const aStr = isPopulatedValue(a) ? String(a).trim() : ''
  const bStr = isPopulatedValue(b) ? String(b).trim() : ''
  if (!aStr && !bStr) return null
  if (!aStr) return bStr
  if (!bStr) return aStr
  if (aStr === bStr) return aStr
  return `${aStr}${MERGE_NOTES_SEPARATOR}${bStr}`
}

function resolveBoolean(a: unknown, b: unknown): unknown {
  return Boolean(a) || Boolean(b)
}

export function resolveMergeValue(
  col: MergeColumnMeta,
  primary: unknown,
  secondary: unknown,
): unknown {
  const override = MERGE_OVERRIDES[col.column_name]
  if (override === 'most_advanced_status') return pickMostAdvancedStatus(primary, secondary)
  if (override === 'earlier') return pickEarlier(primary, secondary)
  if (override === 'concatenate' || isNotesLikeColumn(col)) {
    return concatenateNotes(primary, secondary)
  }

  const udt = col.udt_name
  if (udt === 'bool') return resolveBoolean(primary, secondary)
  if (udt === 'json' || udt === 'jsonb') {
    if (isPopulatedValue(primary) && isPopulatedValue(secondary) && !valuesEqual(primary, secondary)) {
      return primary
    }
    return pickPrimaryIfBoth(primary, secondary)
  }
  if (
    udt === 'int2' ||
    udt === 'int4' ||
    udt === 'int8' ||
    udt === 'numeric' ||
    udt === 'float4' ||
    udt === 'float8'
  ) {
    return pickPrimaryIfBoth(primary, secondary)
  }
  if (udt === 'date' || udt === 'timestamp' || udt === 'timestamptz') {
    return pickEarlier(primary, secondary)
  }
  return pickPrimaryIfBoth(primary, secondary)
}

export function classifyMergeField(
  primary: unknown,
  secondary: unknown,
  resolved: unknown,
): MergeFieldType {
  const pPop = isPopulatedValue(primary)
  const sPop = isPopulatedValue(secondary)
  if (!pPop && !sPop) return 'unchanged'
  if (pPop && sPop && !valuesEqual(primary, secondary)) return 'conflict'
  if (!pPop && sPop) return 'autofill'
  return 'unchanged'
}

export function buildFieldPreviews(
  columns: MergeColumnMeta[],
  primaryRow: Record<string, unknown>,
  secondaryRow: Record<string, unknown>,
): MergeFieldPreview[] {
  const fields: MergeFieldPreview[] = []
  for (const col of columns) {
    const primary = primaryRow[col.column_name] ?? null
    const secondary = secondaryRow[col.column_name] ?? null
    const defaultValue = resolveMergeValue(col, primary, secondary)
    const type = classifyMergeField(primary, secondary, defaultValue)
    const override = MERGE_OVERRIDES[col.column_name]
    fields.push({
      key: col.column_name,
      primary,
      secondary,
      default: defaultValue,
      type,
      requiresConfirmation: override === 'require_confirmation' && (isPopulatedValue(primary) || isPopulatedValue(secondary)),
    })
  }
  return fields
}

export function mergedLocationPatch(
  columns: MergeColumnMeta[],
  primaryRow: Record<string, unknown>,
  secondaryRow: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const col of columns) {
    const key = col.column_name
    if (key in overrides) {
      patch[key] = overrides[key]
      continue
    }
    const resolved = resolveMergeValue(col, primaryRow[key] ?? null, secondaryRow[key] ?? null)
    if (resolved !== undefined) patch[key] = resolved
  }
  return patch
}
