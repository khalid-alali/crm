import type { SupabaseClient } from '@supabase/supabase-js'
import { VINFAST_PROGRAM_ID } from '@/lib/program-config'

async function findVinfastEnrollmentId(
  supabase: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('location_program_enrollments')
    .select('id')
    .eq('location_id', locationId)
    .eq('program_id', VINFAST_PROGRAM_ID)
    .is('unenrolled_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

export async function markLaborRateChecklistItem(
  supabase: SupabaseClient,
  locationId: string,
  itemKey: 'labor_rate_requested' | 'labor_rate_approved',
  completed: boolean,
  completedByEmail: string | null,
): Promise<void> {
  const enrollmentId = await findVinfastEnrollmentId(supabase, locationId)
  if (!enrollmentId) return

  const completedAt = completed ? new Date().toISOString() : null
  const { error } = await supabase.from('program_enrollment_checklist').upsert(
    {
      enrollment_id: enrollmentId,
      item_key: itemKey,
      completed_at: completedAt,
      completed_by_user_id: completed ? completedByEmail : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'enrollment_id,item_key' },
  )
  if (error) throw new Error(error.message)
}
