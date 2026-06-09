import {
  isFirstFreeConsultAvailable,
  qualifiesForFreeConsultWithoutCard,
} from '@/lib/expert-assist/free-consult'
import { supabaseAdmin } from '@/lib/supabase'

export type BillingGateResult = { ok: true } | { ok: false; reason: string }

export type LocationConsultGateFields = {
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_stripe_customer_id: string | null
  consult_stripe_payment_method_id: string | null
  consult_first_free_used_at: string | null
}

export async function getLocationConsultGateFields(shopId: string): Promise<LocationConsultGateFields | null> {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select(
      'consult_enabled, consult_billing_status, consult_stripe_customer_id, consult_stripe_payment_method_id, consult_first_free_used_at',
    )
    .eq('id', shopId)
    .maybeSingle()

  if (error) {
    console.error('getLocationConsultGateFields', error.message)
    return null
  }
  if (!data) return null
  return data as LocationConsultGateFields
}

function hasPaymentMethodOnFile(row: LocationConsultGateFields): boolean {
  return Boolean(row.consult_stripe_customer_id?.trim() && row.consult_stripe_payment_method_id?.trim())
}

function billingIsActive(row: LocationConsultGateFields): boolean {
  return (row.consult_billing_status ?? '').trim().toLowerCase() === 'active'
}

/** Card on file + billing row state — does not require consult_enabled. */
export async function assertShopBillingReady(shopId: string): Promise<BillingGateResult> {
  const row = await getLocationConsultGateFields(shopId)
  if (!row) return { ok: false, reason: 'Shop not found' }
  if (!billingIsActive(row)) return { ok: false, reason: 'Billing is not active for this shop' }
  if (!hasPaymentMethodOnFile(row)) {
    return { ok: false, reason: 'No payment method on file' }
  }
  return { ok: true }
}

/**
 * Consult workflows (inbound SMS, approve, close, web intake).
 * Paid path: enabled + active billing + card on file.
 * No-card signup variant: enabled + not_setup/pending + no card + free consult not yet used.
 */
export async function assertShopCanRunConsults(shopId: string): Promise<BillingGateResult> {
  const row = await getLocationConsultGateFields(shopId)
  if (!row) return { ok: false, reason: 'Shop not found' }
  if (!row.consult_enabled) return { ok: false, reason: 'Expert Assist is not enabled for this shop' }

  if (billingIsActive(row) && hasPaymentMethodOnFile(row)) {
    return { ok: true }
  }

  if (qualifiesForFreeConsultWithoutCard(row)) {
    return { ok: true }
  }

  if (!isFirstFreeConsultAvailable({ consult_first_free_used_at: row.consult_first_free_used_at })) {
    return { ok: false, reason: 'Add a payment method to run consults after the free consult' }
  }
  if (!billingIsActive(row)) {
    return { ok: false, reason: 'Billing is not active for this shop' }
  }
  return { ok: false, reason: 'No payment method on file' }
}

/** For inbound: shop may receive routed SMS only if enabled + billing active. */
export async function shopAllowsInboundConsultSms(shopId: string): Promise<boolean> {
  const r = await assertShopCanRunConsults(shopId)
  return r.ok
}
