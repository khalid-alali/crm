import { normalizeEmail, normalizeName, normalizePhone } from '@/lib/location-merge/values'

export type AccountContactRow = {
  id: string
  location_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  created_at: string
}

export type AccountContactDisplayGroup = {
  key: string
  contacts: AccountContactRow[]
  representative: AccountContactRow
  locationLabels: string[]
}

/** Stable identity for UI dedupe within a role (normalized name, email, phone). */
export function accountContactIdentityKey(contact: Pick<AccountContactRow, 'name' | 'email' | 'phone'>): string {
  return [normalizeName(contact.name), normalizeEmail(contact.email), normalizePhone(contact.phone)].join('\0')
}

function pickRepresentative(contacts: AccountContactRow[]): AccountContactRow {
  const accountWide = contacts.find(c => !c.location_id)
  if (accountWide) return accountWide
  const primary = contacts.find(c => c.is_primary)
  if (primary) return primary
  return [...contacts].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!
}

function locationLabel(
  contact: AccountContactRow,
  locationNameById: Map<string, string>,
): string {
  if (!contact.location_id) return 'Account-wide'
  return locationNameById.get(contact.location_id) ?? 'Unknown location'
}

/** Merge rows that share the same normalized name, email, and phone. */
export function groupAccountContactsForDisplay(
  contacts: AccountContactRow[],
  locations: { id: string; name: string }[],
): AccountContactDisplayGroup[] {
  const locationNameById = new Map(locations.map(l => [l.id, l.name]))
  const byKey = new Map<string, AccountContactRow[]>()

  for (const contact of contacts) {
    const key = accountContactIdentityKey(contact)
    const list = byKey.get(key)
    if (list) list.push(contact)
    else byKey.set(key, [contact])
  }

  const groups: AccountContactDisplayGroup[] = []
  for (const [key, members] of byKey) {
    const representative = pickRepresentative(members)
    const seen = new Set<string>()
    const locationLabels: string[] = []
    const ordered = [...members].sort((a, b) => {
      if (!a.location_id && b.location_id) return -1
      if (a.location_id && !b.location_id) return 1
      return locationLabel(a, locationNameById).localeCompare(locationLabel(b, locationNameById))
    })
    for (const contact of ordered) {
      const label = locationLabel(contact, locationNameById)
      if (seen.has(label)) continue
      seen.add(label)
      locationLabels.push(label)
    }
    groups.push({ key, contacts: members, representative, locationLabels })
  }

  return groups.sort((a, b) => {
    const nameA = (a.representative.name ?? a.representative.email ?? '').toLowerCase()
    const nameB = (b.representative.name ?? b.representative.email ?? '').toLowerCase()
    return nameA.localeCompare(nameB)
  })
}
