const ZIP5_REGEX = /^\d{5}$/

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
