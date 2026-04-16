/**
 * US-centric display and tel: links for CRM phone fields (mostly NANP).
 */

function coreDigits(input: string): string {
  const lower = input.toLowerCase()
  let s = input
  const extAt = lower.search(/\b(ext\.?|x)\s*\d/)
  if (extAt !== -1) s = s.slice(0, extAt)
  return s.replace(/\D/g, '')
}

/** E.164-style digits for tel: (no + in return value). */
export function phoneDigitsForTel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const d = coreDigits(raw.trim())
  if (!d) return null
  if (d.length === 10) return `1${d}`
  if (d.length === 11 && d.startsWith('1')) return d
  return d
}

/** Human-readable display; null if empty / not dialable. */
export function formatPhoneDisplay(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const d = coreDigits(raw.trim())
  if (!d) return null
  let n = d
  if (n.length === 11 && n.startsWith('1')) n = n.slice(1)
  if (n.length === 10) {
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  return raw.trim()
}

export function phoneTelHref(raw: string | null | undefined): string | null {
  const d = phoneDigitsForTel(raw)
  if (!d) return null
  return `tel:+${d}`
}
