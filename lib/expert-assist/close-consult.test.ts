import { beforeEach, describe, expect, it, vi } from 'vitest'

const chargeConsultOffSession = vi.fn()
const markFirstFreeConsultUsed = vi.fn()
const assertShopCanRunConsults = vi.fn()
const insertConsultCaseEvent = vi.fn()
const sendConsultSms = vi.fn()
const sendConsultReceiptEmail = vi.fn()

const caseUpdate = vi.fn()
const locationSelect = vi.fn()

vi.mock('@/lib/expert-assist/billing-charge', () => ({
  chargeConsultOffSession: (...args: unknown[]) => chargeConsultOffSession(...args),
  billableSecondsToCharge: (secs: number | null) => secs ?? 0,
  computeChargeAmountCents: () => 6000,
}))

vi.mock('@/lib/expert-assist/billing', () => ({
  computeConsultBillUsd: () => ({ label: '$60.00', cents: 6000 }),
}))

vi.mock('@/lib/expert-assist/billing-gates', () => ({
  assertShopCanRunConsults: (...args: unknown[]) => assertShopCanRunConsults(...args),
}))

vi.mock('@/lib/expert-assist/free-consult', () => ({
  isFirstFreeConsultAvailable: (loc: { consult_first_free_used_at: string | null } | null) =>
    !loc?.consult_first_free_used_at,
  markFirstFreeConsultUsed: (...args: unknown[]) => markFirstFreeConsultUsed(...args),
}))

vi.mock('@/lib/expert-assist/events', () => ({
  insertConsultCaseEvent: (...args: unknown[]) => insertConsultCaseEvent(...args),
}))

vi.mock('@/lib/expert-assist/send-sms', () => ({
  sendConsultSms: (...args: unknown[]) => sendConsultSms(...args),
}))

vi.mock('@/lib/activation/trigger', () => ({
  triggerConsultCompleted: vi.fn(),
  triggerBillingDunning: vi.fn(),
}))

vi.mock('@/lib/activation/bindings', () => ({
  getState: vi.fn().mockResolvedValue(null),
  sendOnce: vi.fn().mockResolvedValue({ inserted: true }),
}))

vi.mock('@/lib/expert-assist/email', () => ({
  sendConsultReceiptEmail: (...args: unknown[]) => sendConsultReceiptEmail(...args),
  sendConsultBillingFailureEmail: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'consult_cases') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'case-1',
                  shop_id: 'shop-1',
                  originating_phone_number: '+14155550100',
                  outcome: 'resolved_on_call',
                  billable_seconds: 600,
                  status: 'open',
                },
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            caseUpdate(patch)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      if (table === 'locations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => locationSelect(),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      return {}
    },
  },
}))

describe('closeConsultCaseWithBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertShopCanRunConsults.mockResolvedValue({ ok: true })
    markFirstFreeConsultUsed.mockResolvedValue(true)
    chargeConsultOffSession.mockResolvedValue({ paymentIntentId: 'pi_123' })
    insertConsultCaseEvent.mockResolvedValue(undefined)
    sendConsultSms.mockResolvedValue(undefined)
    sendConsultReceiptEmail.mockResolvedValue(undefined)
  })

  it('closes complimentary without Stripe when first free consult is available', async () => {
    locationSelect.mockResolvedValue({
      data: {
        id: 'shop-1',
        name: 'Test Shop',
        consult_billing_email: 'billing@test.com',
        consult_stripe_customer_id: 'cus_1',
        consult_stripe_payment_method_id: 'pm_1',
        consult_first_free_used_at: null,
      },
      error: null,
    })

    const { closeConsultCaseWithBilling } = await import('@/lib/expert-assist/close-consult')
    const res = await closeConsultCaseWithBilling({
      caseId: 'case-1',
      expertEmail: 'expert@repairwise.com',
      source: 'expert',
    })

    expect(res).toEqual({ ok: true, amountLabel: '$0.00', amountCents: 0 })
    expect(markFirstFreeConsultUsed).toHaveBeenCalledOnce()
    expect(chargeConsultOffSession).not.toHaveBeenCalled()
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'closed',
        billed_amount_cents: 0,
        is_complimentary: true,
      }),
    )
    expect(sendConsultReceiptEmail).not.toHaveBeenCalled()
  })

  it('charges Stripe when free consult was already used', async () => {
    locationSelect.mockResolvedValue({
      data: {
        id: 'shop-1',
        name: 'Test Shop',
        consult_billing_email: 'billing@test.com',
        consult_stripe_customer_id: 'cus_1',
        consult_stripe_payment_method_id: 'pm_1',
        consult_first_free_used_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })

    const { closeConsultCaseWithBilling } = await import('@/lib/expert-assist/close-consult')
    const res = await closeConsultCaseWithBilling({
      caseId: 'case-1',
      expertEmail: 'expert@repairwise.com',
      source: 'expert',
    })

    expect(res).toEqual({ ok: true, amountLabel: '$60.00', amountCents: 6000 })
    expect(markFirstFreeConsultUsed).not.toHaveBeenCalled()
    expect(chargeConsultOffSession).toHaveBeenCalledOnce()
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'closed',
        billed_amount_cents: 6000,
        is_complimentary: false,
      }),
    )
    expect(sendConsultReceiptEmail).toHaveBeenCalledOnce()
  })

  it('falls through to paid billing when free consult claim loses race', async () => {
    locationSelect.mockResolvedValue({
      data: {
        id: 'shop-1',
        name: 'Test Shop',
        consult_billing_email: 'billing@test.com',
        consult_stripe_customer_id: 'cus_1',
        consult_stripe_payment_method_id: 'pm_1',
        consult_first_free_used_at: null,
      },
      error: null,
    })
    markFirstFreeConsultUsed.mockResolvedValue(false)

    const { closeConsultCaseWithBilling } = await import('@/lib/expert-assist/close-consult')
    const res = await closeConsultCaseWithBilling({
      caseId: 'case-1',
      expertEmail: 'expert@repairwise.com',
      source: 'expert',
    })

    expect(res.ok).toBe(true)
    expect(chargeConsultOffSession).toHaveBeenCalledOnce()
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_complimentary: false,
        billed_amount_cents: 6000,
      }),
    )
  })
})
