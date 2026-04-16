/**
 * Zoho Sign CSV exports often put a phone number in the "Company" column; the real
 * DBA / shop name is usually in Text - 1 (older template) or Text-m2mcxdbk (Midas-style).
 */

export function looksLikePhoneNumber(s: string | null | undefined): boolean {
  const t = (s ?? '').trim()
  if (!t) return false
  const digits = t.replace(/\D/g, '')
  if (digits.length < 10) return false
  // Real company names with digits (e.g. "A1 Auto") still have a word ≥4 letters
  if (/\b[a-zA-Z]{4,}\b/.test(t)) return false
  if (digits.length > 22) return false
  return true
}

function clean(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

const NAME_CANDIDATE_KEYS = [
  'Company',
  'Text-m2mcxdbk',
  'Text - 1',
  'Text - 2',
  'Text - 3',
  'Text-m2mdosf5',
] as const

/** First non-empty CSV field that is not phone-like; suitable for shop / counterparty company. */
export function resolveZohoCsvBusinessName(row: Record<string, string>): string | null {
  for (const key of NAME_CANDIDATE_KEYS) {
    const v = clean(row[key])
    if (v && !looksLikePhoneNumber(v)) return v
  }
  return null
}

/** Phone for CRM: explicit phone columns, or Company when it is clearly a phone. */
export function resolveZohoCsvPhone(row: Record<string, string>): string | null {
  const fromCols = clean(row['Phone']) ?? clean(row['Text-malfbhiy'])
  if (fromCols) return fromCols
  const company = clean(row['Company'])
  if (company && looksLikePhoneNumber(company)) return company
  return null
}

const ADDRESS_CANDIDATE_KEYS = ['Address', 'Text-m2mb4143', 'Text - 2', 'Text - 3'] as const

/** Street / city line from Zoho (not the business-name columns). */
export function resolveZohoCsvAddress(row: Record<string, string>): string | null {
  for (const key of ADDRESS_CANDIDATE_KEYS) {
    const v = clean(row[key])
    if (v && !looksLikePhoneNumber(v)) return v
  }
  return null
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ZOHO_SHOP_EMAIL_KEYS = [
  'Text-malf9y3n',
  'Text-m2mdosf5',
  'Text - 3',
  'Text - 2',
  'Text-malfbhiy',
] as const

function normalizeEmail(v: string | null): string | null {
  if (!v) return null
  const cleaned = v.trim().toLowerCase()
  if (!SIMPLE_EMAIL.test(cleaned)) return null
  return cleaned
}

/**
 * Zoho Midas-style template: shop / site inbox (often the location's primary_contact_email),
 * while "Email" is the individual signer — must match locations by this field, not signer email.
 */
export function resolveZohoCsvShopContactEmail(row: Record<string, string>): string | null {
  const signerEmail = normalizeEmail(clean(row['Email']))

  // Preferred: known template keys where shop inbox is usually stored.
  for (const key of ZOHO_SHOP_EMAIL_KEYS) {
    const candidate = normalizeEmail(clean(row[key]))
    if (!candidate) continue
    if (signerEmail && candidate === signerEmail) continue
    if (candidate.includes('repairwise')) continue
    return candidate
  }

  // Fallback: scan all fields for a second non-signer email.
  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase()
    if (!k.startsWith('text') && k !== 'company') continue
    const candidate = normalizeEmail(clean(value))
    if (!candidate) continue
    if (signerEmail && candidate === signerEmail) continue
    if (candidate.includes('repairwise')) continue
    return candidate
  }

  return null
}
