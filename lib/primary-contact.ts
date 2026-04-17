import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedContact = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

function pickResolved(
  contacts: Array<{
    id: string
    name: string | null
    email: string | null
    phone: string | null
    account_id: string | null
    location_id: string | null
    is_primary: boolean
    created_at: string
  }>,
  accountId: string,
  locationId?: string | null,
): ResolvedContact | null {
  const forAccount = contacts.filter(c => c.account_id === accountId)
  if (forAccount.length === 0) return null

  const byCreated = [...forAccount].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  if (locationId) {
    const locScoped = forAccount.filter(c => c.location_id === locationId)
    const locPrimary = locScoped.find(c => c.is_primary)
    if (locPrimary) {
      return {
        id: locPrimary.id,
        name: locPrimary.name,
        email: locPrimary.email,
        phone: locPrimary.phone,
      }
    }
  }

  const acctPrimary = forAccount.find(c => c.is_primary)
  if (acctPrimary) {
    return {
      id: acctPrimary.id,
      name: acctPrimary.name,
      email: acctPrimary.email,
      phone: acctPrimary.phone,
    }
  }

  const first = byCreated[0]!
  return { id: first.id, name: first.name, email: first.email, phone: first.phone }
}

/** Best contact for display / email flows (BDR “Owner” column uses `name`). */
export async function resolvePrimaryContact(
  supabase: SupabaseClient,
  accountId: string | null | undefined,
  locationId?: string | null,
): Promise<ResolvedContact | null> {
  if (!accountId) return null

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, email, phone, account_id, location_id, is_primary, created_at')
    .eq('account_id', accountId)

  if (error || !data?.length) return null
  return pickResolved(data, accountId, locationId)
}

export type LocationPrimaryRow = { id: string; account_id: string | null }

/** Batch-resolve primary contacts for pipeline / list views. */
export async function attachPrimaryContactsToLocations<
  T extends LocationPrimaryRow & Record<string, unknown>,
>(supabase: SupabaseClient, rows: T[]): Promise<Array<T & { primary_owner_name: string | null; primary_owner_email: string | null }>> {
  const accountIds = [...new Set(rows.map(r => r.account_id).filter(Boolean))] as string[]
  if (accountIds.length === 0) {
    return rows.map(r => ({ ...r, primary_owner_name: null, primary_owner_email: null }))
  }

  const { data: allContacts, error } = await supabase
    .from('contacts')
    .select('id, name, email, phone, account_id, location_id, is_primary, created_at')
    .in('account_id', accountIds)

  if (error || !allContacts) {
    return rows.map(r => ({ ...r, primary_owner_name: null, primary_owner_email: null }))
  }

  return rows.map(row => {
    if (!row.account_id) {
      return { ...row, primary_owner_name: null, primary_owner_email: null }
    }
    const resolved = pickResolved(allContacts, row.account_id, row.id)
    return {
      ...row,
      primary_owner_name: resolved?.name ?? resolved?.email ?? null,
      primary_owner_email: resolved?.email ?? null,
    }
  })
}

export async function attachPrimaryContactsToAccounts<
  T extends { id: string } & Record<string, unknown>,
>(supabase: SupabaseClient, rows: T[]): Promise<Array<T & { primary_owner_name: string | null; primary_owner_email: string | null; primary_owner_phone: string | null }>> {
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return []

  const { data: allContacts, error } = await supabase
    .from('contacts')
    .select('id, name, email, phone, account_id, location_id, is_primary, created_at')
    .in('account_id', ids)

  if (error || !allContacts) {
    return rows.map(r => ({ ...r, primary_owner_name: null, primary_owner_email: null, primary_owner_phone: null }))
  }

  return rows.map(row => {
    const resolved = pickResolved(allContacts, row.id, null)
    return {
      ...row,
      primary_owner_name: resolved?.name ?? resolved?.email ?? null,
      primary_owner_email: resolved?.email ?? null,
      primary_owner_phone: resolved?.phone ?? null,
    }
  })
}
