import { describe, expect, it } from 'vitest'
import { computeStage } from '@/lib/activation/stages'
import type { ActivationStageFacts } from '@/lib/activation/types'

const NOW = Date.parse('2026-06-09T12:00:00.000Z')

function daysAgo(n: number): string {
  return new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()
}

function facts(partial: Partial<ActivationStageFacts>): ActivationStageFacts {
  return {
    signed_up_at: null,
    first_inbound_at: null,
    first_consult_at: null,
    last_consult_at: null,
    consult_count: 0,
    ...partial,
  }
}

describe('computeStage', () => {
  it('returns invited when not signed up', () => {
    expect(computeStage(facts({ signed_up_at: null }), { nowMs: NOW })).toBe('invited')
  })

  it('returns signed_up with signup and no inbound SMS', () => {
    expect(
      computeStage(
        facts({ signed_up_at: daysAgo(3), first_inbound_at: null, consult_count: 0 }),
        { nowMs: NOW },
      ),
    ).toBe('signed_up')
  })

  it('returns engaged with inbound SMS and no closed consult', () => {
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(10),
          first_inbound_at: daysAgo(2),
          consult_count: 0,
        }),
        { nowMs: NOW },
      ),
    ).toBe('engaged')
  })

  it('returns activated with one recent closed consult', () => {
    const closed = daysAgo(10)
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(30),
          first_inbound_at: daysAgo(20),
          consult_count: 1,
          first_consult_at: closed,
          last_consult_at: closed,
        }),
        { nowMs: NOW },
      ),
    ).toBe('activated')
  })

  it('returns active with two consults within 60 days and recent activity', () => {
    const first = daysAgo(45)
    const second = daysAgo(5)
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(60),
          first_inbound_at: daysAgo(50),
          consult_count: 2,
          first_consult_at: first,
          last_consult_at: second,
        }),
        { nowMs: NOW },
      ),
    ).toBe('active')
  })

  it('returns dormant when last consult older than 60 days', () => {
    const first = daysAgo(120)
    const second = daysAgo(90)
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(150),
          first_inbound_at: daysAgo(140),
          consult_count: 2,
          first_consult_at: first,
          last_consult_at: second,
        }),
        { nowMs: NOW },
      ),
    ).toBe('dormant')
  })

  it('returns activated when consult reopens after dormant period', () => {
    const first = daysAgo(90)
    const recent = daysAgo(3)
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(150),
          first_inbound_at: daysAgo(140),
          consult_count: 2,
          first_consult_at: first,
          last_consult_at: recent,
        }),
        { nowMs: NOW },
      ),
    ).toBe('activated')
  })

  it('does not treat inbound before signup as engaged', () => {
    expect(
      computeStage(
        facts({
          signed_up_at: null,
          first_inbound_at: daysAgo(1),
          consult_count: 0,
        }),
        { nowMs: NOW },
      ),
    ).toBe('invited')
  })

  it('variant B: no card does not block stage progression', () => {
    const closed = daysAgo(4)
    expect(
      computeStage(
        facts({
          signed_up_at: daysAgo(7),
          first_inbound_at: daysAgo(3),
          consult_count: 1,
          first_consult_at: closed,
          last_consult_at: closed,
        }),
        { nowMs: NOW },
      ),
    ).toBe('activated')
  })
})
