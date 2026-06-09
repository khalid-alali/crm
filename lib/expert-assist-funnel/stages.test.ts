import { describe, expect, it } from 'vitest'
import { deriveExpertAssistFunnelStage, isSignupComplete } from '@/lib/expert-assist-funnel/stages'

const NOW = Date.parse('2026-06-09T12:00:00.000Z')

function daysAgo(n: number): string {
  return new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()
}

describe('isSignupComplete', () => {
  it('accepts consult_enabled', () => {
    expect(isSignupComplete({ consultBillingStatus: 'not_setup', consultEnabled: true })).toBe(true)
  })

  it('accepts billing active', () => {
    expect(isSignupComplete({ consultBillingStatus: 'active', consultEnabled: false })).toBe(true)
  })

  it('rejects not signed up', () => {
    expect(isSignupComplete({ consultBillingStatus: 'not_setup', consultEnabled: false })).toBe(false)
  })
})

describe('deriveExpertAssistFunnelStage', () => {
  it('returns invited when signup incomplete', () => {
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: false,
          hasInboundSms: false,
          closedConsultCount: 0,
          firstClosedAt: null,
          secondClosedAt: null,
          lastClosedAt: null,
        },
        { nowMs: NOW },
      ),
    ).toBe('invited')
  })

  it('returns signed_up with signup and no inbound SMS', () => {
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: true,
          hasInboundSms: false,
          closedConsultCount: 0,
          firstClosedAt: null,
          secondClosedAt: null,
          lastClosedAt: null,
        },
        { nowMs: NOW },
      ),
    ).toBe('signed_up')
  })

  it('returns engaged with inbound SMS and no closed consult', () => {
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: true,
          hasInboundSms: true,
          closedConsultCount: 0,
          firstClosedAt: null,
          secondClosedAt: null,
          lastClosedAt: null,
        },
        { nowMs: NOW },
      ),
    ).toBe('engaged')
  })

  it('returns activated with one recent closed consult', () => {
    const closed = daysAgo(10)
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: true,
          hasInboundSms: true,
          closedConsultCount: 1,
          firstClosedAt: closed,
          secondClosedAt: null,
          lastClosedAt: closed,
        },
        { nowMs: NOW },
      ),
    ).toBe('activated')
  })

  it('returns active with two consults within 60 days and recent activity', () => {
    const first = daysAgo(45)
    const second = daysAgo(5)
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: true,
          hasInboundSms: true,
          closedConsultCount: 2,
          firstClosedAt: first,
          secondClosedAt: second,
          lastClosedAt: second,
        },
        { nowMs: NOW },
      ),
    ).toBe('active')
  })

  it('returns dormant when last consult older than 60 days', () => {
    const first = daysAgo(120)
    const second = daysAgo(90)
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: true,
          hasInboundSms: true,
          closedConsultCount: 2,
          firstClosedAt: first,
          secondClosedAt: second,
          lastClosedAt: second,
        },
        { nowMs: NOW },
      ),
    ).toBe('dormant')
  })

  it('respects manual stage override', () => {
    expect(
      deriveExpertAssistFunnelStage(
        {
          signupComplete: false,
          hasInboundSms: false,
          closedConsultCount: 0,
          firstClosedAt: null,
          secondClosedAt: null,
          lastClosedAt: null,
        },
        { nowMs: NOW, manualStageOverride: true, storedStage: 'engaged' },
      ),
    ).toBe('engaged')
  })
})
