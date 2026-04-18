/** Strip to US national digits (10); leading country code 1 is removed. */
export function stripPhoneToNationalDigits(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.slice(0, 10)
}

export function formatUsPhoneDisplay(digits: string): string {
  const d = stripPhoneToNationalDigits(digits)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Empty is OK (optional phone). Otherwise exactly 10 digits. */
export function validateUsPhoneOptional(digits: string): string | null {
  const d = stripPhoneToNationalDigits(digits)
  if (d.length === 0) return null
  if (d.length < 10) return 'Enter a 10-digit US phone number'
  return null
}

const TLD_TYPO = /\.(comm|con|cmo|orgg|nett|coom|om)([^a-z]|$)/i

/**
 * Light-touch email check: obvious shape + common TLD typos.
 * Returns null if OK, else user-facing message.
 */
export function validatePortalEmail(email: string): string | null {
  const e = email.trim()
  if (!e) return 'Email is required'
  if (e.includes(' ') || e.includes('..')) return 'Enter a valid email address'
  if (!e.includes('@')) return 'Enter a valid email address'
  const [local, domain] = e.split('@')
  if (!local || !domain || domain.split('@').length > 1) return 'Enter a valid email address'
  if (!domain.includes('.')) return 'Enter a valid email address'
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  if (tld.length < 2) return 'Enter a valid email address'
  if (TLD_TYPO.test(e)) return 'Check your domain spelling (.com, .net, etc.)'
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  if (!ok) return 'Enter a valid email address'
  return null
}
