import Stripe from 'stripe'
import { computeConsultBillUsd } from '@/lib/expert-assist/billing'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY?.trim()
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
    _stripe = new Stripe(key)
  }
  return _stripe
}

export async function chargeConsultOffSession(params: {
  customerId: string
  paymentMethodId: string
  amountCents: number
  caseId: string
  idempotencyKey?: string
}): Promise<{ paymentIntentId: string } | { error: string }> {
  const stripe = getStripe()
  if (params.amountCents <= 0) return { error: 'Nothing to charge' }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { consult_case_id: params.caseId },
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    )
    if (pi.status !== 'succeeded') return { error: `Payment not succeeded (${pi.status})` }
    return { paymentIntentId: pi.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Charge failed'
    return { error: msg }
  }
}

export function billableSecondsToCharge(expertSeconds: number | null | undefined, overrideSeconds?: number | null): number {
  const raw = overrideSeconds != null && Number.isFinite(overrideSeconds) ? overrideSeconds : expertSeconds
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.max(0, n)
}

export function computeChargeAmountCents(billableSeconds: number): number {
  return computeConsultBillUsd(billableSeconds).cents
}
