import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivationCounterField, ActivationTimestampField } from '@/lib/activation/types'
import { ensureActivationState } from '@/lib/activation/state'

export async function writeFactIfNull(
  supabase: SupabaseClient,
  locationId: string,
  field: ActivationTimestampField,
  timestamp: string,
): Promise<boolean> {
  await ensureActivationState(supabase, locationId)

  const { data, error } = await supabase
    .from('activation_state')
    .select(field)
    .eq('location_id', locationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const current = (data as Record<string, string | null> | null)?.[field] ?? null
  if (current) return false

  const { error: updateError } = await supabase
    .from('activation_state')
    .update({ [field]: timestamp })
    .eq('location_id', locationId)
    .is(field, null)

  if (updateError) throw new Error(updateError.message)
  return true
}

export async function incrementCounter(
  supabase: SupabaseClient,
  locationId: string,
  field: ActivationCounterField,
): Promise<number> {
  await ensureActivationState(supabase, locationId)

  const { data, error } = await supabase
    .from('activation_state')
    .select(field)
    .eq('location_id', locationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const row = data as Record<string, number> | null
  const next = (row?.[field] ?? 0) + 1

  const { error: updateError } = await supabase
    .from('activation_state')
    .update({ [field]: next })
    .eq('location_id', locationId)

  if (updateError) throw new Error(updateError.message)
  return next
}

export async function setSmsChannelDead(
  supabase: SupabaseClient,
  locationId: string,
  dead: boolean,
): Promise<void> {
  await ensureActivationState(supabase, locationId)
  const { error } = await supabase
    .from('activation_state')
    .update({ sms_channel_dead: dead })
    .eq('location_id', locationId)
  if (error) throw new Error(error.message)
}

export async function setFirstInboundIfNull(
  supabase: SupabaseClient,
  locationId: string,
  timestamp: string = new Date().toISOString(),
): Promise<boolean> {
  return writeFactIfNull(supabase, locationId, 'first_inbound_at', timestamp)
}

export async function writeConsultFacts(
  supabase: SupabaseClient,
  locationId: string,
  _consultId: string,
  closedAt: string,
): Promise<{ firstConsult: boolean; consultCount: number }> {
  const firstConsult = await writeFactIfNull(supabase, locationId, 'first_consult_at', closedAt)

  const { error: lastError } = await supabase
    .from('activation_state')
    .update({ last_consult_at: closedAt })
    .eq('location_id', locationId)

  if (lastError) throw new Error(lastError.message)

  const consultCount = await incrementCounter(supabase, locationId, 'consult_count')
  return { firstConsult, consultCount }
}
