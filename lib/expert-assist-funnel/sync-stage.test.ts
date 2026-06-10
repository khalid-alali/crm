import { describe, expect, it, vi } from 'vitest'
import { syncExpertAssistEnrollmentStage } from '@/lib/expert-assist-funnel/sync-stage'

vi.mock('@/lib/expert-assist-enrollments', () => ({
  getExpertAssistShopProgramView: vi.fn(),
}))

import { getExpertAssistShopProgramView } from '@/lib/expert-assist-enrollments'

function mockSupabase(input: {
  storedStage: string
  updateError?: string | null
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(
      input.updateError ? { error: { message: input.updateError } } : { error: null },
    ),
  })

  return {
    from: vi.fn((table: string) => {
      if (table !== 'location_program_enrollments') throw new Error(`unexpected table ${table}`)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { stage: input.storedStage },
              error: null,
            }),
          }),
        }),
        update,
      }
    }),
    _update: update,
  }
}

describe('syncExpertAssistEnrollmentStage', () => {
  it('skips writes when manual stage override is set', async () => {
    vi.mocked(getExpertAssistShopProgramView).mockResolvedValue({
      id: 'enr-1',
      locationId: 'loc-1',
      stage: 'engaged',
      manualStageOverride: true,
    } as Awaited<ReturnType<typeof getExpertAssistShopProgramView>>)

    const supabase = mockSupabase({ storedStage: 'signed_up' })
    const result = await syncExpertAssistEnrollmentStage(supabase as never, 'loc-1')

    expect(result).toMatchObject({
      changed: false,
      manualStageOverride: true,
      stage: 'engaged',
    })
    expect(supabase._update).not.toHaveBeenCalled()
  })

  it('persists derived stage when it differs from stored stage', async () => {
    vi.mocked(getExpertAssistShopProgramView).mockResolvedValue({
      id: 'enr-1',
      locationId: 'loc-1',
      stage: 'engaged',
      manualStageOverride: false,
    } as Awaited<ReturnType<typeof getExpertAssistShopProgramView>>)

    const supabase = mockSupabase({ storedStage: 'signed_up' })
    const result = await syncExpertAssistEnrollmentStage(supabase as never, 'loc-1')

    expect(result).toMatchObject({
      changed: true,
      previousStage: 'signed_up',
      stage: 'engaged',
    })
    expect(supabase._update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'engaged' }),
    )
  })
})
