import { beforeEach, describe, expect, it, vi } from 'vitest'

let gateRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: gateRow, error: null }),
        }),
      }),
    }),
  },
}))

describe('assertShopCanRunConsults', () => {
  beforeEach(() => {
    gateRow = null
    vi.resetModules()
  })

  it('allows no-card signup variant before free consult is used', async () => {
    gateRow = {
      consult_enabled: true,
      consult_billing_status: 'not_setup',
      consult_stripe_customer_id: null,
      consult_stripe_payment_method_id: null,
      consult_first_free_used_at: null,
    }

    const { assertShopCanRunConsults } = await import('@/lib/expert-assist/billing-gates')
    await expect(assertShopCanRunConsults('shop-1')).resolves.toEqual({ ok: true })
  })

  it('requires payment method after free consult is used', async () => {
    gateRow = {
      consult_enabled: true,
      consult_billing_status: 'not_setup',
      consult_stripe_customer_id: null,
      consult_stripe_payment_method_id: null,
      consult_first_free_used_at: '2026-01-01T00:00:00Z',
    }

    const { assertShopCanRunConsults } = await import('@/lib/expert-assist/billing-gates')
    const res = await assertShopCanRunConsults('shop-1')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toContain('payment method')
    }
  })

  it('allows shops with active billing and card on file', async () => {
    gateRow = {
      consult_enabled: true,
      consult_billing_status: 'active',
      consult_stripe_customer_id: 'cus_1',
      consult_stripe_payment_method_id: 'pm_1',
      consult_first_free_used_at: '2026-01-01T00:00:00Z',
    }

    const { assertShopCanRunConsults } = await import('@/lib/expert-assist/billing-gates')
    await expect(assertShopCanRunConsults('shop-1')).resolves.toEqual({ ok: true })
  })
})
