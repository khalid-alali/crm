import { supabaseAdmin } from '@/lib/supabase'

export type BillingGateResult = { ok: true } | { ok: false; reason: string }

export async function getLocationConsultGateFields(shopId: string): Promise<{
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_stripe_customer_id: string | null
  consult_stripe_payment_method_id: string | null
} | null> {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('consult_enabled, consult_billing_status, consult_stripe_customer_id, consult_stripe_payment_method_id')
    .eq('id', shopId)
    .maybeSingle()

  if (error) {
    console.error('getLocationConsultGateFields', error.message)
    return null
  }
  if (!data) return null
  return data as {
    consult_enabled: boolean | null
    consult_billing_status: string | null
    consult_stripe_customer_id: string | null
    consult_stripe_payment_method_id: string | null
  }
}

/** Card on file + billing row state — does not require consult_enabled. */
export async function assertShopBillingReady(shopId: string): Promise<BillingGateResult> {
  const row = await getLocationConsultGateFields(shopId)
  if (!row) return { ok: false, reason: 'Shop not found' }
  if (row.consult_billing_status !== 'active')
    return { ok: false, reason: 'Billing is not active for this shop' }
  if (!row.consult_stripe_customer_id?.trim() || !row.consult_stripe_payment_method_id?.trim()) {
    return { ok: false, reason: 'No payment method on file' }
  }
  return { ok: true }
}

/** SOW §8.1 — billable consult workflows require active card + enabled flag. */
export async function assertShopCanRunConsults(shopId: string): Promise<BillingGateResult> {
  const row = await getLocationConsultGateFields(shopId)
  if (!row) return { ok: false, reason: 'Shop not found' }
  if (!row.consult_enabled) return { ok: false, reason: 'Expert Assist is not enabled for this shop' }
  if (row.consult_billing_status !== 'active')
    return { ok: false, reason: 'Billing is not active for this shop' }
  if (!row.consult_stripe_customer_id?.trim() || !row.consult_stripe_payment_method_id?.trim()) {
    return { ok: false, reason: 'No payment method on file' }
  }
  return { ok: true }
}

/** For inbound: shop may receive routed SMS only if enabled + billing active. */
export async function shopAllowsInboundConsultSms(shopId: string): Promise<boolean> {
  const r = await assertShopCanRunConsults(shopId)
  return r.ok
}
