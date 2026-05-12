/** Canonical `locations.vf_operational_status` values (VinFast post-launch ops). */
export const VINFAST_OPERATIONAL_STATUS_OPTIONS = [
  'Onboarding',
  'Onboarding Paused',
  'Fully Operational',
  'Slow Operational',
  'PIP',
  'Terminated from VF',
] as const

export type VinfastOperationalStatusValue = (typeof VINFAST_OPERATIONAL_STATUS_OPTIONS)[number]

export function normalizeVfOperationalStatus(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

export function vfOperationalStatusEquals(
  dbValue: string | null | undefined,
  canonical: string,
): boolean {
  return normalizeVfOperationalStatus(dbValue) === normalizeVfOperationalStatus(canonical)
}

/** Map user/DB input to canonical option, or null if unknown / empty. */
export function canonicalizeVfOperationalStatus(raw: string | null | undefined): VinfastOperationalStatusValue | null {
  const n = normalizeVfOperationalStatus(raw)
  if (!n) return null
  const found = VINFAST_OPERATIONAL_STATUS_OPTIONS.find(o => o.toLowerCase() === n)
  return found ?? null
}

export const VINFAST_DEFAULT_OPS_WHEN_ACTIVE: VinfastOperationalStatusValue = 'Slow Operational'
export const VINFAST_DEFAULT_OPS_WHEN_NOT_READY: VinfastOperationalStatusValue = 'Onboarding'
