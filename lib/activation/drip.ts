import type { SupabaseClient } from '@supabase/supabase-js'
import { hasShopEvent } from '@/lib/activation/events'
import type { ActivationStateView, DripDoneReason, DripStep } from '@/lib/activation/types'

export function dripDone(state: Pick<ActivationStateView, 'first_inbound_at' | 'signed_up_at'> & {
  consultEnabled?: boolean | null
}): DripDoneReason | false {
  if (state.consultEnabled === false) return 'disabled'
  if (!state.signed_up_at) return 'disabled'
  if (state.first_inbound_at) return 'first_inbound'
  return false
}

function dripStepDedupeKey(step: DripStep): string {
  return `drip:${step}`
}

export async function shouldSendDripStep(
  supabase: SupabaseClient,
  locationId: string,
  step: DripStep,
  state: ActivationStateView,
): Promise<boolean> {
  const done = dripDone({
    first_inbound_at: state.first_inbound_at,
    signed_up_at: state.signed_up_at,
    consultEnabled: true,
  })
  if (done) return false

  if (
    state.sms_channel_dead &&
    (step === 'front_desk_sms' || step === 'nudge_1' || step === 'nudge_2')
  ) {
    return false
  }

  const alreadySent = await hasShopEvent(
    supabase,
    locationId,
    'message.sent',
    dripStepDedupeKey(step),
  )
  return !alreadySent
}

export type OwnerGapEmailVariant = 'forward_cta' | 'counter_card' | 'economics'

/**
 * Pick T+5 owner email variant by first missing activation checkbox (plan §3.1).
 * Stub — returns variant key; email body wiring lands in Phase 4.
 */
export function sendOwnerEmailByGap(
  state: Pick<
    ActivationStateView,
    | 'owner_forward_clicked_at'
    | 'counter_card_downloaded_at'
    | 'card_added_at'
    | 'activation_variant'
  >,
): OwnerGapEmailVariant {
  if (!state.owner_forward_clicked_at) return 'forward_cta'
  if (!state.counter_card_downloaded_at) return 'counter_card'
  return 'economics'
}
