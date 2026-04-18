/** Allowed values for portal capabilities (server validation + client radios). */

export const YES_NO = ['yes', 'no'] as const
export type YesNo = (typeof YES_NO)[number]

export const TIRES_VALUES = ['machine_balancer', 'sublet', 'no'] as const
/** Wheel alignment, windshields, body, ADAS (in shop / sublet / no). */
export const THREE_TIER = ['in_shop', 'sublet', 'no'] as const
export const ALIGNMENT_VALUES = THREE_TIER
export const AC_VALUES = ['r134a', 'r1234yf', 'both', 'no'] as const

export function isYesNo(v: string | undefined): v is YesNo {
  return v === 'yes' || v === 'no'
}

export function isMember<T extends readonly string[]>(v: string | undefined, set: T): v is T[number] {
  return Boolean(v && (set as readonly string[]).includes(v))
}

export function fmtPortalLogValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const s = String(v).trim()
  return s === '' ? '—' : s
}
