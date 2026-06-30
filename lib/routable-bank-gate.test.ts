import { describe, expect, it } from 'vitest'
import {
  deriveBankLinkState,
  isRoutableBankLinked,
  routablePollIntervalMs,
  shouldPollRoutableLocation,
  snapshotFromLocation,
  type RoutableLocationRow,
} from '@/lib/routable-bank-gate'
import { parseAccountLast4, parseExternalFlowUrl } from '@/lib/routable'

const baseRow = (over: Partial<RoutableLocationRow> = {}): RoutableLocationRow => ({
  id: 'loc-1',
  routable_id: 'co_123',
  routable_status: null,
  routable_payment_method_count: 0,
  routable_account_last4: null,
  routable_link_started_at: null,
  portal_unlocked_at: null,
  pm_last_checked_at: null,
  last_routable_link_sent_at: null,
  ...over,
})

describe('isRoutableBankLinked', () => {
  it('is linked when payment methods exist', () => {
    expect(isRoutableBankLinked({ routable_payment_method_count: 1, routable_status: null, portal_unlocked_at: null })).toBe(true)
  })

  it('is linked when status is accepted', () => {
    expect(isRoutableBankLinked({ routable_payment_method_count: 0, routable_status: 'accepted', portal_unlocked_at: null })).toBe(true)
  })

  it('is linked when portal_unlocked_at is set', () => {
    expect(
      isRoutableBankLinked({
        routable_payment_method_count: 0,
        routable_status: null,
        portal_unlocked_at: '2026-06-01T00:00:00Z',
      }),
    ).toBe(true)
  })
})

describe('deriveBankLinkState', () => {
  it('returns waiting_setup without a routable id', () => {
    expect(deriveBankLinkState(baseRow({ routable_id: null }))).toBe('waiting_setup')
  })

  it('returns not_started when routable exists but flow never started', () => {
    expect(deriveBankLinkState(baseRow())).toBe('not_started')
  })

  it('returns in_progress after link generation', () => {
    expect(deriveBankLinkState(baseRow({ routable_link_started_at: '2026-06-01T00:00:00Z' }))).toBe('in_progress')
  })

  it('returns finishing on redirect return before accepted', () => {
    expect(
      deriveBankLinkState(baseRow({ routable_status: 'invited' }), { returningFromFlow: true }),
    ).toBe('finishing')
  })

  it('returns linked when payment method exists', () => {
    expect(deriveBankLinkState(baseRow({ routable_payment_method_count: 1 }))).toBe('linked')
  })
})

describe('routablePollIntervalMs', () => {
  it('polls frequently right after flow start', () => {
    const started = new Date('2026-06-01T12:00:00Z').toISOString()
    expect(routablePollIntervalMs({ routable_link_started_at: started, last_routable_link_sent_at: null }, Date.parse('2026-06-01T12:05:00Z'))).toBe(30_000)
  })
})

describe('shouldPollRoutableLocation', () => {
  it('does not poll linked shops', () => {
    expect(shouldPollRoutableLocation(baseRow({ routable_payment_method_count: 1 }))).toBe(false)
  })

  it('polls shops with routable id that have never been checked', () => {
    expect(shouldPollRoutableLocation(baseRow())).toBe(true)
  })
})

describe('parseExternalFlowUrl', () => {
  it('reads a top-level external_flow_url', () => {
    expect(parseExternalFlowUrl({ external_flow_url: 'https://routable.com/flow/abc' })).toBe(
      'https://routable.com/flow/abc',
    )
  })

  it('reads nested contact links', () => {
    expect(
      parseExternalFlowUrl({
        contacts: [{ external_flow_url: 'https://routable.com/flow/contact' }],
      }),
    ).toBe('https://routable.com/flow/contact')
  })
})

describe('parseAccountLast4', () => {
  it('extracts last4 from payment method payload', () => {
    expect(parseAccountLast4({ results: [{ last4: '1234' }] })).toBe('1234')
  })
})

describe('snapshotFromLocation', () => {
  it('marks unlocked linked shops', () => {
    const snap = snapshotFromLocation(baseRow({ routable_payment_method_count: 1, routable_account_last4: '9876' }))
    expect(snap.unlocked).toBe(true)
    expect(snap.state).toBe('linked')
    expect(snap.accountLast4).toBe('9876')
  })
})
