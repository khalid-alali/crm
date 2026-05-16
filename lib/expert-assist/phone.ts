/** Normalize SMS identifiers to a consistent E.164-like string for DB lookups (match Twilio From). */
export function normalizeSmsAddress(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return ''
  const t = raw.trim()
  if (!t) return ''
  const digits = t.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return ''
}

export function normalizeShopShortCode(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return ''
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
