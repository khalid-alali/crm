import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isRoutableBankLinked,
  ROUTABLE_LOCATION_SELECT,
  type RoutableLocationRow,
} from '@/lib/routable-bank-gate'

export async function loadRoutableLocationRow(
  admin: SupabaseClient,
  locationId: string,
): Promise<RoutableLocationRow | null> {
  const { data, error } = await admin
    .from('locations')
    .select(ROUTABLE_LOCATION_SELECT)
    .eq('id', locationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as RoutableLocationRow | null) ?? null
}

/** Enrollment portal is unlocked once the shop has linked their Routable payout method. */
export function isPortalEnrollmentUnlocked(row: RoutableLocationRow | null): boolean {
  if (!row) return false
  return isRoutableBankLinked(row)
}
