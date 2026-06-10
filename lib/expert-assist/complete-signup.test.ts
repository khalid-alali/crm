import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CompleteExpertAssistSignupError,
  completeExpertAssistSignup,
} from '@/lib/expert-assist/complete-signup'

vi.mock('@/lib/expert-assist/service-writer-contact', () => ({
  upsertExpertAssistServiceWriter: vi.fn(async () => ({
    contactId: 'contact-1',
    approvedContactId: 'approved-1',
  })),
}))

vi.mock('@/lib/program-enrollment-service', () => ({
  enrollLocationInProgram: vi.fn(async () => ({ enrollmentId: 'enroll-1', created: true })),
  getActiveEnrollment: vi.fn(async () => null),
}))

import { upsertExpertAssistServiceWriter } from '@/lib/expert-assist/service-writer-contact'
import { enrollLocationInProgram } from '@/lib/program-enrollment-service'

function mockSupabase(location: Record<string, unknown> | null) {
  const locationUpdates: unknown[] = []
  const enrollmentUpdates: unknown[] = []

  const supabase = {
    from: (table: string) => {
      if (table === 'locations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: location, error: null }),
            }),
          }),
          update: (payload: unknown) => {
            locationUpdates.push(payload)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      if (table === 'location_program_enrollments') {
        return {
          update: (payload: unknown) => {
            enrollmentUpdates.push(payload)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { supabase, locationUpdates, enrollmentUpdates }
}

describe('completeExpertAssistSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enables consult and enrolls when skip_card is true', async () => {
    const { supabase, locationUpdates } = mockSupabase({
      id: 'loc-1',
      account_id: 'acct-1',
      consult_enabled: false,
      consult_billing_status: 'not_setup',
      consult_stripe_payment_method_id: null,
      consult_first_free_used_at: null,
    })

    const result = await completeExpertAssistSignup(supabase as never, {
      locationId: 'loc-1',
      name: 'Alex Writer',
      email: 'alex@shop.com',
      phone: '+15551234567',
      isOwner: true,
      skipCard: true,
    })

    expect(result.consultEnabled).toBe(true)
    expect(result.activationVariant).toBe('card_after_first_consult')
    expect(result.contactId).toBe('contact-1')
    expect(result.enrollmentId).toBe('enroll-1')
    expect(upsertExpertAssistServiceWriter).toHaveBeenCalled()
    expect(enrollLocationInProgram).toHaveBeenCalled()
    expect(locationUpdates).toEqual([{ consult_enabled: true }])
  })

  it('rejects skip_card when free consult path is not eligible', async () => {
    const { supabase } = mockSupabase({
      id: 'loc-1',
      account_id: null,
      consult_enabled: false,
      consult_billing_status: 'not_setup',
      consult_stripe_payment_method_id: null,
      consult_first_free_used_at: '2026-01-01T00:00:00.000Z',
    })

    await expect(
      completeExpertAssistSignup(supabase as never, {
        locationId: 'loc-1',
        name: 'Alex',
        isOwner: false,
        skipCard: true,
      }),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<CompleteExpertAssistSignupError>)
  })

  it('saves service writer without enabling when skip_card is false', async () => {
    const { supabase, locationUpdates } = mockSupabase({
      id: 'loc-1',
      account_id: null,
      consult_enabled: false,
      consult_billing_status: 'not_setup',
      consult_stripe_payment_method_id: null,
      consult_first_free_used_at: null,
    })

    const result = await completeExpertAssistSignup(supabase as never, {
      locationId: 'loc-1',
      name: 'Alex',
      isOwner: false,
      skipCard: false,
      enroll: false,
    })

    expect(result.consultEnabled).toBe(false)
    expect(result.activationVariant).toBe('card_required')
    expect(locationUpdates).toEqual([])
    expect(enrollLocationInProgram).not.toHaveBeenCalled()
  })
})
