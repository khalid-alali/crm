import type { SupabaseClient } from '@supabase/supabase-js'
import type { LogShopEventResult } from '@/lib/activation/types'

const PG_UNIQUE_VIOLATION = '23505'

export async function logShopEvent(
  supabase: SupabaseClient,
  locationId: string,
  eventType: string,
  dedupeKey: string,
  payload: Record<string, unknown> = {},
): Promise<LogShopEventResult> {
  const { error } = await supabase.from('shop_events').insert({
    location_id: locationId,
    event_type: eventType,
    dedupe_key: dedupeKey,
    payload,
  })

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { inserted: false }
    throw new Error(error.message)
  }

  return { inserted: true }
}

export async function hasShopEvent(
  supabase: SupabaseClient,
  locationId: string,
  eventType: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('shop_events')
    .select('id')
    .eq('location_id', locationId)
    .eq('event_type', eventType)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function sendOnce(
  supabase: SupabaseClient,
  locationId: string,
  dedupeKey: string,
  sendFn: () => Promise<void>,
  payload: Record<string, unknown> = {},
): Promise<LogShopEventResult> {
  const reserved = await logShopEvent(supabase, locationId, 'message.sent', dedupeKey, payload)
  if (!reserved.inserted) return reserved

  await sendFn()
  return reserved
}
