import { describe, expect, it, vi } from 'vitest'
import { logShopEvent, sendOnce } from '@/lib/activation/events'

function mockSupabaseForEvents(input: { duplicate?: boolean }) {
  const insert = vi.fn().mockResolvedValue(
    input.duplicate ? { error: { code: '23505', message: 'duplicate' } } : { error: null },
  )

  return {
    from: vi.fn((table: string) => {
      if (table !== 'shop_events') throw new Error(`unexpected table ${table}`)
      return { insert }
    }),
    _insert: insert,
  }
}

describe('logShopEvent', () => {
  it('returns inserted true on success', async () => {
    const supabase = mockSupabaseForEvents({})
    const result = await logShopEvent(supabase as never, 'loc-1', 'test.event', 'key-1', { ok: true })
    expect(result).toEqual({ inserted: true })
  })

  it('returns inserted false on unique violation', async () => {
    const supabase = mockSupabaseForEvents({ duplicate: true })
    const result = await logShopEvent(supabase as never, 'loc-1', 'test.event', 'key-1')
    expect(result).toEqual({ inserted: false })
  })
})


describe('sendOnce', () => {
  it('runs sendFn only when event insert succeeds', async () => {
    const supabase = mockSupabaseForEvents({})
    const sendFn = vi.fn().mockResolvedValue(undefined)

    const result = await sendOnce(supabase as never, 'loc-1', 'email:welcome', sendFn)

    expect(result).toEqual({ inserted: true })
    expect(sendFn).toHaveBeenCalledOnce()
    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: 'loc-1',
        event_type: 'message.sent',
        dedupe_key: 'email:welcome',
      }),
    )
  })

  it('skips sendFn when dedupe_key already exists', async () => {
    const supabase = mockSupabaseForEvents({ duplicate: true })
    const sendFn = vi.fn().mockResolvedValue(undefined)

    const result = await sendOnce(supabase as never, 'loc-1', 'email:welcome', sendFn)

    expect(result).toEqual({ inserted: false })
    expect(sendFn).not.toHaveBeenCalled()
  })
})

