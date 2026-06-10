import { describe, expect, it } from 'vitest'
import { buildSubject } from '@/lib/labor-rate-approval/email-content'

describe('buildSubject', () => {
  it('is stable without a day countdown', () => {
    expect(
      buildSubject({
        shopName: 'Parkwood Collision Aubrey',
        city: 'Aubrey',
        state: 'TX',
        chargeRate: 200,
        decisionToken: 'token',
        submittedAt: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe('Labor rate approval · Parkwood Collision Aubrey')
  })
})
