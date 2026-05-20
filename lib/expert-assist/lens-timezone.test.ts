import { describe, expect, it } from 'vitest'
import {
  formatUtcOffsetForZoho,
  resolveShopTimeZone,
} from '@/lib/expert-assist/lens-timezone'

describe('resolveShopTimeZone', () => {
  it('maps US state codes to IANA zones', () => {
    expect(resolveShopTimeZone('CA')).toBe('America/Los_Angeles')
    expect(resolveShopTimeZone('ny')).toBe('America/New_York')
  })

  it('falls back when state is missing or unknown', () => {
    expect(resolveShopTimeZone(null)).toBe('America/Los_Angeles')
    expect(resolveShopTimeZone('XX')).toBe('America/Los_Angeles')
  })
})

describe('formatUtcOffsetForZoho', () => {
  it('returns signed offset with hours and minutes', () => {
    const offset = formatUtcOffsetForZoho(
      new Date('2026-01-15T18:00:00.000Z'),
      'America/Los_Angeles'
    )
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/)
  })
})
