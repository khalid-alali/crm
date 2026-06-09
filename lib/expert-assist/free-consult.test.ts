import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
import {
  FREE_CONSULT_CHECKLIST_KEY,
  isFirstFreeConsultAvailable,
  markFirstFreeConsultUsed,
  qualifiesForFreeConsultWithoutCard,
} from '@/lib/expert-assist/free-consult'

describe('isFirstFreeConsultAvailable', () => {
  it('returns true when timestamp is null', () => {
    expect(isFirstFreeConsultAvailable({ consult_first_free_used_at: null })).toBe(true)
    expect(isFirstFreeConsultAvailable(undefined)).toBe(true)
  })

  it('returns false when timestamp is set', () => {
    expect(
      isFirstFreeConsultAvailable({ consult_first_free_used_at: '2026-01-15T12:00:00Z' }),
    ).toBe(false)
  })
})

describe('qualifiesForFreeConsultWithoutCard', () => {
  const base = {
    consult_enabled: true,
    consult_billing_status: 'not_setup',
    consult_stripe_payment_method_id: null,
    consult_first_free_used_at: null,
  }

  it('allows enabled no-card signup before free consult is used', () => {
    expect(qualifiesForFreeConsultWithoutCard(base)).toBe(true)
    expect(qualifiesForFreeConsultWithoutCard({ ...base, consult_billing_status: 'pending' })).toBe(true)
  })

  it('rejects after free consult consumed or when card is on file', () => {
    expect(
      qualifiesForFreeConsultWithoutCard({ ...base, consult_first_free_used_at: '2026-01-01T00:00:00Z' }),
    ).toBe(false)
    expect(qualifiesForFreeConsultWithoutCard({ ...base, consult_stripe_payment_method_id: 'pm_1' })).toBe(
      false,
    )
    expect(qualifiesForFreeConsultWithoutCard({ ...base, consult_billing_status: 'active' })).toBe(false)
    expect(qualifiesForFreeConsultWithoutCard({ ...base, consult_billing_status: 'payment_failed' })).toBe(
      false,
    )
  })
})

describe('markFirstFreeConsultUsed', () => {
  it('returns false when location was already claimed', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'locations') {
          return {
            update: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
    }

    const claimed = await markFirstFreeConsultUsed({
      supabase: supabase as never,
      locationId: 'loc-1',
      usedAt: '2026-06-01T00:00:00Z',
      actorEmail: 'expert@repairwise.com',
    })
    expect(claimed).toBe(false)
  })

  it('upserts checklist when location claim succeeds', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'locations') {
          return {
            update: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id: 'loc-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'location_program_enrollments') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: { id: 'enroll-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'program_enrollment_checklist') {
          return { upsert }
        }
        throw new Error(`unexpected table ${table}`)
      }),
    }

    const claimed = await markFirstFreeConsultUsed({
      supabase: supabase as never,
      locationId: 'loc-1',
      usedAt: '2026-06-01T00:00:00Z',
      actorEmail: 'expert@repairwise.com',
    })

    expect(claimed).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: 'enroll-1',
        item_key: FREE_CONSULT_CHECKLIST_KEY,
        completed_by_user_id: 'expert@repairwise.com',
      }),
      { onConflict: 'enrollment_id,item_key' },
    )
  })
})
