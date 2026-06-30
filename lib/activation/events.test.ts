import { describe, expect, it, vi } from 'vitest'
import { logActivationSendActivity } from '@/lib/activation/activity-log'
import { logShopEvent, sendOnce } from '@/lib/activation/events'

function mockSupabaseForEvents(input: {
  duplicate?: boolean
  sendFails?: boolean
  activityLogFails?: boolean
}) {
  const shopEventsInsert = vi.fn().mockResolvedValue(
    input.duplicate ? { error: { code: '23505', message: 'duplicate' } } : { error: null },
  )
  const activityLogInsert = vi.fn().mockResolvedValue(
    input.activityLogFails ? { error: { message: 'activity log failed' } } : { error: null },
  )
  const del = vi.fn().mockResolvedValue({ error: null })

  return {
    from: vi.fn((table: string) => {
      if (table === 'shop_events') {
        return {
          insert: shopEventsInsert,
          delete: () => ({
            eq: () => ({
              eq: () => ({
                eq: del,
              }),
            }),
          }),
        }
      }
      if (table === 'activity_log') {
        return { insert: activityLogInsert }
      }
      throw new Error(`unexpected table ${table}`)
    }),
    _shopEventsInsert: shopEventsInsert,
    _activityLogInsert: activityLogInsert,
    _delete: del,
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
    expect(supabase._shopEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: 'loc-1',
        event_type: 'message.sent',
        dedupe_key: 'email:welcome',
      }),
    )
    expect(supabase._activityLogInsert).not.toHaveBeenCalled()
  })

  it('writes activity_log when sendFn returns message metadata', async () => {
    const supabase = mockSupabaseForEvents({})
    const sendFn = vi.fn().mockResolvedValue({
      channel: 'email',
      to: 'owner@shop.com',
      subject: 'Welcome',
      body: 'Hello',
    })

    await sendOnce(supabase as never, 'loc-1', 'email:welcome', sendFn)

    expect(supabase._activityLogInsert).toHaveBeenCalledWith({
      location_id: 'loc-1',
      type: 'email',
      subject: 'Welcome',
      body: 'Hello\n\n— Expert Assist (automated)',
      to_email: 'owner@shop.com',
      sent_by: 'expert-assist',
    })
  })

  it('skips sendFn when dedupe_key already exists', async () => {
    const supabase = mockSupabaseForEvents({ duplicate: true })
    const sendFn = vi.fn().mockResolvedValue(undefined)

    const result = await sendOnce(supabase as never, 'loc-1', 'email:welcome', sendFn)

    expect(result).toEqual({ inserted: false })
    expect(sendFn).not.toHaveBeenCalled()
    expect(supabase._activityLogInsert).not.toHaveBeenCalled()
  })

  it('releases dedupe when sendFn throws so a retry can send', async () => {
    const supabase = mockSupabaseForEvents({})
    const sendFn = vi.fn().mockRejectedValue(new Error('Resend down'))

    await expect(sendOnce(supabase as never, 'loc-1', 'email:welcome', sendFn)).rejects.toThrow(
      'Resend down',
    )

    expect(sendFn).toHaveBeenCalledOnce()
    expect(supabase._delete).toHaveBeenCalledOnce()
    expect(supabase._activityLogInsert).not.toHaveBeenCalled()
  })
})

describe('logActivationSendActivity', () => {
  it('logs SMS as note type', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: vi.fn(() => ({ insert })) }

    await logActivationSendActivity(supabase as never, 'loc-1', {
      channel: 'sms',
      to: '+15551234567',
      subject: 'Counter card chase (CC-1)',
      body: 'Please send a photo',
    })

    expect(insert).toHaveBeenCalledWith({
      location_id: 'loc-1',
      type: 'note',
      subject: 'Counter card chase (CC-1)',
      body: 'Please send a photo\n\n— Expert Assist (automated)',
      to_email: '+15551234567',
      sent_by: 'expert-assist',
    })
  })
})
