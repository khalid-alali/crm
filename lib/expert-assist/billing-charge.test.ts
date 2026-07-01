import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('chargeConsultOffSession', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a normal error instead of throwing when STRIPE_SECRET_KEY is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const { chargeConsultOffSession } = await import('@/lib/expert-assist/billing-charge')

    const result = await chargeConsultOffSession({
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountCents: 6000,
      caseId: 'case-1',
    })

    expect(result).toEqual({ error: 'Missing STRIPE_SECRET_KEY' })
  })

  it('never touches Stripe when there is nothing to charge, even with no key configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const { chargeConsultOffSession } = await import('@/lib/expert-assist/billing-charge')

    const result = await chargeConsultOffSession({
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountCents: 0,
      caseId: 'case-1',
    })

    expect(result).toEqual({ error: 'Nothing to charge' })
  })
})
