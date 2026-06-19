// Portal security boundary.
//
// The shop-facing portal has NO Supabase RLS — every query runs as the service
// role, so the JWT's locationId is the ONLY thing standing between a shop and
// another shop's data. There is no database backstop. Every portal route that
// touches an enrollment MUST route through these guards. A missing check is a
// cross-shop data leak.
//
// The guards are pure (no IO) so they're unit-tested in portal-authz.test.ts.
// The loaders do the service-role reads.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isShopCompletable } from '@/lib/portal-checklist'

export type PortalEnrollmentRow = {
  id: string
  location_id: string
  program_id: string
  stage: string
  manual_stage_override: boolean
  first_job_completed_at: string | null
  unenrolled_at: string | null
}

export type Guard = { ok: true } | { ok: false; status: number; error: string }

const ENROLLMENT_COLUMNS =
  'id, location_id, program_id, stage, manual_stage_override, first_job_completed_at, unenrolled_at'

/**
 * Assert an enrollment belongs to the token's location and is active.
 * Returns 404 (not 403) on a foreign enrollment so we never confirm that an
 * enrollment id exists for some other shop.
 */
export function assertEnrollmentOwned(
  enrollment: PortalEnrollmentRow | null,
  tokenLocationId: string,
): Guard {
  if (!enrollment) return { ok: false, status: 404, error: 'Enrollment not found' }
  if (enrollment.location_id !== tokenLocationId) {
    return { ok: false, status: 404, error: 'Enrollment not found' }
  }
  if (enrollment.unenrolled_at) {
    return { ok: false, status: 400, error: 'Enrollment is no longer active' }
  }
  return { ok: true }
}

/**
 * Assert the shop is allowed to complete this item: it must be shop-visible AND
 * flagged completable in the overlay. Rejects fl/vf items, hidden items, and
 * unknown keys — even if the client crafts the request directly.
 */
export function assertShopCompletable(programId: string, itemKey: string): Guard {
  if (!isShopCompletable(programId, itemKey)) {
    return { ok: false, status: 403, error: 'This item cannot be completed from the shop portal' }
  }
  return { ok: true }
}

export async function loadEnrollmentById(
  admin: SupabaseClient,
  enrollmentId: string,
): Promise<PortalEnrollmentRow | null> {
  const { data, error } = await admin
    .from('location_program_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('id', enrollmentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PortalEnrollmentRow | null) ?? null
}

export async function loadActiveEnrollmentsForLocation(
  admin: SupabaseClient,
  locationId: string,
): Promise<PortalEnrollmentRow[]> {
  const { data, error } = await admin
    .from('location_program_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('location_id', locationId)
    .is('unenrolled_at', null)
  if (error) throw new Error(error.message)
  return (data as PortalEnrollmentRow[] | null) ?? []
}

export type PortalChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
}

/** Batched read of completion rows for many enrollments (avoids N+1). */
export async function loadChecklistRows(
  admin: SupabaseClient,
  enrollmentIds: string[],
): Promise<PortalChecklistRow[]> {
  if (enrollmentIds.length === 0) return []
  const { data, error } = await admin
    .from('program_enrollment_checklist')
    .select('enrollment_id, item_key, completed_at')
    .in('enrollment_id', enrollmentIds)
  if (error) throw new Error(error.message)
  return (data as PortalChecklistRow[] | null) ?? []
}
