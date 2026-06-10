import { describe, expect, it } from 'vitest'
import {
  formatLaborRateThreadMessageId,
  laborRateThreadHeaders,
} from '@/lib/labor-rate-approval/thread'

describe('formatLaborRateThreadMessageId', () => {
  it('embeds approval id and notifications domain', () => {
    expect(formatLaborRateThreadMessageId('abc-123')).toBe(
      '<labor-rate-abc-123@notifications.fixlane.com>',
    )
  })
})

describe('laborRateThreadHeaders', () => {
  it('sets Message-ID on a new thread', () => {
    const { headers, newThreadMessageId } = laborRateThreadHeaders({
      approvalId: 'abc-123',
    })
    expect(headers['Message-ID']).toBe('<labor-rate-abc-123@notifications.fixlane.com>')
    expect(newThreadMessageId).toBe(headers['Message-ID'])
  })

  it('replies in-thread when a root message id exists', () => {
    const root = '<labor-rate-abc-123@notifications.fixlane.com>'
    const { headers, newThreadMessageId } = laborRateThreadHeaders({
      existingThreadMessageId: root,
    })
    expect(headers['In-Reply-To']).toBe(root)
    expect(headers.References).toBe(root)
    expect(newThreadMessageId).toBeNull()
  })
})
