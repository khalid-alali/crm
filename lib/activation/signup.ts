import type { SupabaseClient } from '@supabase/supabase-js'
import { logShopEvent } from '@/lib/activation/events'
import { writeFactIfNull } from '@/lib/activation/facts'
import { recomputeStage } from '@/lib/activation/recompute'
import { ensureActivationState } from '@/lib/activation/state'
import { triggerActivationDrip } from '@/lib/activation/trigger'
import type { ActivationVariant } from '@/lib/activation/types'

export function activationVariantFromSkipCard(skipCard: boolean): ActivationVariant {
  return skipCard ? 'card_after_first_consult' : 'card_required'
}

export async function recordExpertAssistSignup(
  supabase: SupabaseClient,
  locationId: string,
  activationVariant: ActivationVariant,
): Promise<void> {
  const now = new Date().toISOString()

  await ensureActivationState(supabase, locationId, { activationVariant })
  const { error: variantError } = await supabase
    .from('activation_state')
    .update({ activation_variant: activationVariant })
    .eq('location_id', locationId)
  if (variantError) throw new Error(variantError.message)

  await writeFactIfNull(supabase, locationId, 'signed_up_at', now)
  await recomputeStage(supabase, locationId)
  await logShopEvent(supabase, locationId, 'shop.signed_up', `signup:${locationId}`, {
    activation_variant: activationVariant,
  })

  if (activationVariant === 'card_after_first_consult') {
    await triggerActivationDrip(locationId)
  }
}
