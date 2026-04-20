const ZIP5_REGEX = /^\d{5}$/

/**
 * Lead intake / webhooks: trim, accept ZIP+4 (use first five), then accept only a valid US 5-digit ZIP.
 * Returns null if missing or not safely coercible (caller treats as "no zip").
 */
export function coerceUsZip5OrNull(value: unknown): string | null {
  if (value == null) return null
  const raw = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!raw) return null

  const compact = raw.replace(/\s+/g, '')
  const zip4 = /^(\d{5})-\d{4}$/.exec(compact)
  if (zip4) return zip4[1]

  if (ZIP5_REGEX.test(compact)) return compact

  const digits = compact.replace(/\D/g, '')
  if (digits.length === 5 && ZIP5_REGEX.test(digits)) return digits
  if (digits.length === 9) return digits.slice(0, 5)

  return null
}

export function normalizePostalCode(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getPostalCodeError(value: unknown): string | null {
  const postalCode = normalizePostalCode(value)
  if (!postalCode) return null
  if (!ZIP5_REGEX.test(postalCode)) return 'Postal code must be exactly 5 digits.'
  return null
}

export function isValidPostalCode(value: unknown): boolean {
  return getPostalCodeError(value) === null
}
