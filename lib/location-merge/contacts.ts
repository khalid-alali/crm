import { normalizeEmail, normalizeName, normalizePhone } from '@/lib/location-merge/values'

export type ContactRow = {
  id: string
  location_id: string | null
  account_id: string | null
  name: string | null
  email: string | null
  phone: string | null
}

function contactPairMatch(a: ContactRow, b: ContactRow): boolean {
  const nameA = normalizeName(a.name)
  const nameB = normalizeName(b.name)
  const emailA = normalizeEmail(a.email)
  const emailB = normalizeEmail(b.email)
  const phoneA = normalizePhone(a.phone)
  const phoneB = normalizePhone(b.phone)

  let matches = 0
  if (nameA && nameB && nameA === nameB) matches++
  if (emailA && emailB && emailA === emailB) matches++
  if (phoneA && phoneB && phoneA === phoneB) matches++
  return matches >= 2
}

/** Returns secondary contact ids to delete after merge (duplicates of primary-side contacts). */
export function findDuplicateContactIds(
  primaryContacts: ContactRow[],
  secondaryContacts: ContactRow[],
): string[] {
  const toDelete = new Set<string>()
  for (const sec of secondaryContacts) {
    for (const pri of primaryContacts) {
      if (contactPairMatch(pri, sec)) {
        toDelete.add(sec.id)
        break
      }
    }
    if (toDelete.has(sec.id)) continue
    for (const other of secondaryContacts) {
      if (other.id === sec.id) continue
      if (toDelete.has(other.id)) continue
      if (contactPairMatch(sec, other) && sec.id > other.id) {
        toDelete.add(sec.id)
        break
      }
    }
  }
  return [...toDelete]
}

export function countContactDedupes(
  primaryContacts: ContactRow[],
  secondaryContacts: ContactRow[],
): number {
  return findDuplicateContactIds(primaryContacts, secondaryContacts).length
}
