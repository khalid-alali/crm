import { describe, expect, it } from 'vitest'
import {
  invite1Email,
  ref2ReferralBookedEmail,
  refPush1Email,
} from '@/lib/activation/lifecycle-copy'

describe('lifecycle-copy', () => {
  const ctx = {
    locationId: 'loc-1',
    shopName: 'Test Shop',
    ownerName: 'Jane Owner',
    ownerEmail: 'jane@example.com',
    ownerPhone: null,
    serviceWriterName: 'Sam Writer',
    serviceWriterEmail: null,
    frontDeskPhone: null,
    toolboxCasePartner: 'TESTSHOP',
  } as never

  it('INV-1 uses Tesla Expert Assist subject and setup URL', () => {
    const { subject, text } = invite1Email(ctx, 'https://setup.example/s/loc-1')
    expect(subject).toBe('Tesla Expert Assist is live — you’re first in line')
    expect(text).toContain('Jane —')
    expect(text).toContain('https://setup.example/s/loc-1')
  })

  it('REF-PUSH-1 fires at two consults copy line', () => {
    const { subject, text } = refPush1Email(ctx, 'https://toolkit.example')
    expect(subject).toBe('Two consults in. Here’s the bigger play.')
    expect(text).toContain('twice now')
    expect(text).toContain('https://toolkit.example')
  })

  it('REF-2 referral booked copy', () => {
    const { subject, text } = ref2ReferralBookedEmail(ctx)
    expect(subject).toBe('Your customer just booked')
    expect(text).toContain('remote diagnostic')
  })
})
