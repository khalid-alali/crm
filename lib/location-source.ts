/** Allowed `locations.source` values (DB stores snake_case). */
export const LOCATION_SOURCES = [
  'cold_call',
  'referral',
  'inbound',
  'event',
  'import',
  'other',
] as const

/** Human-readable labels for pipeline and detail UI. */
export const LOCATION_SOURCE_LABELS: Record<string, string> = {
  cold_call: 'Cold call',
  referral: 'Referral',
  inbound: 'Inbound',
  event: 'Event',
  import: 'Import',
  other: 'Other',
}

function titleCaseSnakeCase(source: string) {
  return source
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Display string for a stored source value (unknown values become title case). */
export function formatLocationSource(source: string | null | undefined): string {
  if (source == null || source.trim() === '') return '—'
  return LOCATION_SOURCE_LABELS[source] ?? titleCaseSnakeCase(source)
}
