import { listContacts, type DialpadContact } from '@/lib/dialpad-api'
import { phoneMatchKey } from '@/lib/phone'

const CACHE_MS = 10 * 60 * 1000

let contactIndexCache: { expiresAt: number; byPhone: Map<string, string> } | null = null

/** Best display label for a Dialpad contact record. */
export function dialpadContactDisplayName(contact: DialpadContact): string | null {
  const display = contact.display_name?.trim()
  if (display) return display
  const company = contact.company_name?.trim()
  if (company) return company
  const person = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
  return person || null
}

/** Index Dialpad contacts by normalized phone digits (phoneMatchKey form). */
export function buildContactPhoneIndex(contacts: DialpadContact[]): Map<string, string> {
  const byPhone = new Map<string, string>()
  for (const contact of contacts) {
    const name = dialpadContactDisplayName(contact)
    if (!name) continue
    const phones = [...(contact.phones ?? []), contact.primary_phone].filter(Boolean) as string[]
    for (const phone of phones) {
      const key = phoneMatchKey(phone)
      if (key && !byPhone.has(key)) byPhone.set(key, name)
    }
  }
  return byPhone
}

async function contactIndex(): Promise<Map<string, string>> {
  if (contactIndexCache && Date.now() < contactIndexCache.expiresAt) {
    return contactIndexCache.byPhone
  }
  const contacts = await listContacts({ includeLocal: true })
  const byPhone = buildContactPhoneIndex(contacts)
  contactIndexCache = { expiresAt: Date.now() + CACHE_MS, byPhone }
  return byPhone
}

/** Resolve Dialpad contact names for E.164 external numbers. Keys are phoneMatchKey digits. */
export async function resolveDialpadContactNames(
  externalNumbers: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(
    externalNumbers.map(phoneMatchKey).filter((k): k is string => Boolean(k)),
  )
  if (wanted.size === 0) return new Map()

  const index = await contactIndex()
  const out = new Map<string, string>()
  for (const key of wanted) {
    const name = index.get(key)
    if (name) out.set(key, name)
  }
  return out
}

/** Test helper — clears the in-memory contacts cache. */
export function clearDialpadContactCache(): void {
  contactIndexCache = null
}
