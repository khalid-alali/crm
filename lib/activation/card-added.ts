import type { SupabaseClient } from '@supabase/supabase-js'
import { logShopEvent } from '@/lib/activation/events'
import { writeFactIfNull } from '@/lib/activation/facts'
import { recomputeStage } from '@/lib/activation/recompute'
import { ensureActivationState, getState } from '@/lib/activation/state'
import { triggerActivationDrip } from '@/lib/activation/trigger'

export async function recordExpertAssistCardAdded(
  supabase: SupabaseClient,
  locationId: string,
): Promise<void> {
  const now = new Date().toISOString()

  await ensureActivationState(supabase, locationId)
  await writeFactIfNull(supabase, locationId, 'card_added_at', now)
  await recomputeStage(supabase, locationId)
  await logShopEvent(supabase, locationId, 'billing.card_added', `billing-card:${locationId}`, {})

  const state = await getState(supabase, locationId)
  if (state?.activation_variant === 'card_required') {
    await triggerActivationDrip(locationId)
  }
}
