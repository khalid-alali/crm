/** Loose pragmatic check; Resend rejects invalid addresses at send time. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s)
}

/**
 * Normalizes a recipient list from `string[]` or legacy single `string`.
 * Trims, lowercases, dedupes (first occurrence wins), validates format.
 */
export function normalizeRecipientList(input: unknown): string[] {
  const raw: string[] = []
  if (Array.isArray(input)) {
    for (const x of input) {
      if (typeof x === 'string' && x.trim()) raw.push(x.trim())
    }
  } else if (typeof input === 'string' && input.trim()) {
    raw.push(input.trim())
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const s of raw) {
    const lower = s.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (!isValidEmail(lower)) {
      throw new Error(`Invalid recipient: ${s}`)
    }
    out.push(lower)
  }
  return out
}
