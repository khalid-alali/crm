import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'

export const FREE_CONSULT_CHECKLIST_KEY = 'free_consult_used' as const

export type LocationFreeConsultFields = {
  consult_first_free_used_at: string | null
}

export type NoCardSignupLocation = LocationFreeConsultFields & {
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_stripe_payment_method_id: string | null
}

export function isFirstFreeConsultAvailable(
  location: LocationFreeConsultFields | null | undefined,
): boolean {
  return !location?.consult_first_free_used_at
}

/**
 * No-card signup A/B variant: enabled without Stripe, still eligible for the one complimentary consult.
 * After the free consult is consumed, billing gates require a card again.
 */
export function qualifiesForFreeConsultWithoutCard(
  location: NoCardSignupLocation | null | undefined,
): boolean {
  if (!location?.consult_enabled) return false
  if (!isFirstFreeConsultAvailable(location)) return false
  if (location.consult_stripe_payment_method_id?.trim()) return false

  const status = (location.consult_billing_status ?? '').trim().toLowerCase()
  if (status === 'payment_failed' || status === 'paused' || status === 'active') return false
  return status === 'not_setup' || status === 'pending'
}

async function findExpertAssistEnrollmentId(
  supabase: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('location_program_enrollments')
    .select('id')
    .eq('location_id', locationId)
    .eq('program_id', EXPERT_ASSIST_PROGRAM_ID)
    .is('unenrolled_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/**
 * Atomically marks the shop's one-time free consult as used and syncs the funnel checklist.
 * Returns true if this call claimed the free consult; false if another close won the race.
 */
export async function markFirstFreeConsultUsed(params: {
  supabase: SupabaseClient
  locationId: string
  usedAt: string
  actorEmail?: string | null
}): Promise<boolean> {
  const { data: updated, error: locError } = await params.supabase
    .from('locations')
    .update({ consult_first_free_used_at: params.usedAt })
    .eq('id', params.locationId)
    .is('consult_first_free_used_at', null)
    .select('id')
    .maybeSingle()

  if (locError) throw new Error(locError.message)
  if (!updated) return false

  const enrollmentId = await findExpertAssistEnrollmentId(params.supabase, params.locationId)
  if (enrollmentId) {
    const completedBy = params.actorEmail?.trim() || 'system'
    const { error: checklistError } = await params.supabase.from('program_enrollment_checklist').upsert(
      {
        enrollment_id: enrollmentId,
        item_key: FREE_CONSULT_CHECKLIST_KEY,
        completed_at: params.usedAt,
        completed_by_user_id: completedBy,
        updated_at: params.usedAt,
      },
      { onConflict: 'enrollment_id,item_key' },
    )
    if (checklistError) throw new Error(checklistError.message)
  }

  revalidatePath('/consults')
  return true
}
