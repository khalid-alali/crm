import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivationStateView } from '@/lib/activation/types'

export async function locationHasOpenBillingFailure(
  supabase: SupabaseClient,
  locationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('locations')
    .select('consult_billing_status, consult_enabled')
    .eq('id', locationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const row = data as { consult_billing_status: string | null; consult_enabled: boolean | null } | null
  if (!row) return false
  return row.consult_billing_status === 'payment_failed' || row.consult_enabled === false
}

/** Promotional lifecycle sends pause when billing is failing or shop is disabled. */
export async function shouldPausePromotionalLifecycle(
  supabase: SupabaseClient,
  locationId: string,
): Promise<boolean> {
  return locationHasOpenBillingFailure(supabase, locationId)
}

export function shouldSkipFrontDeskSms(state: ActivationStateView): boolean {
  return state.sms_channel_dead === true
}

export function inviteChaseDone(state: Pick<ActivationStateView, 'signed_up_at'>): boolean {
  return Boolean(state.signed_up_at)
}

export function cc1ShouldSend(state: Pick<
  ActivationStateView,
  'printout_photo_received_at' | 'first_inbound_at' | 'counter_card_downloaded_at'
>): boolean {
  if (state.printout_photo_received_at) return false
  if (state.first_inbound_at) return false
  if (!state.counter_card_downloaded_at) return false
  return true
}

export function act2ShouldSend(state: Pick<
  ActivationStateView,
  'first_consult_at' | 'consult_count' | 'first_inbound_at' | 'last_consult_at'
>, anchorClosedAt: string): boolean {
  if (!state.first_consult_at) return false
  if (state.consult_count > 1) return false
  if (state.first_inbound_at && Date.parse(state.first_inbound_at) > Date.parse(anchorClosedAt)) {
    return false
  }
  if (state.last_consult_at && Date.parse(state.last_consult_at) > Date.parse(anchorClosedAt)) {
    return false
  }
  return true
}

export function refPush2ShouldSend(state: Pick<
  ActivationStateView,
  'referral_count' | 'first_referral_at' | 'toolkit_link_clicked_at' | 'ref_push_1_sent'
>): boolean {
  if (!state.ref_push_1_sent) return false
  if (state.referral_count > 0 || state.first_referral_at) return false
  if (state.toolkit_link_clicked_at) return false
  return true
}

export function dor75ShouldSend(state: Pick<
  ActivationStateView,
  'dor75_sent' | 'last_consult_at'
>, anchorClosedAt: string): boolean {
  if (state.dor75_sent) return false
  if (!state.last_consult_at) return false
  if (Date.parse(state.last_consult_at) > Date.parse(anchorClosedAt)) return false
  return true
}
