/** Allowed `locations.disqualified_reason` values (Churned / inactive pipeline). */
export const DISQUALIFIED_REASON_VALUES = [
  'not_interested',
  'corporate_shop',
  'unresponsive',
  'other',
] as const

export type DisqualifiedReason = (typeof DISQUALIFIED_REASON_VALUES)[number]

export const DISQUALIFIED_REASON_LABELS: Record<DisqualifiedReason, string> = {
  not_interested: 'Not Interested',
  corporate_shop: 'Corporate shop',
  unresponsive: 'Unresponsive',
  other: 'Other',
}

export function parseDisqualifiedReason(raw: unknown): DisqualifiedReason | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') return null
  const v = raw.trim() as DisqualifiedReason
  return DISQUALIFIED_REASON_VALUES.includes(v) ? v : null
}
