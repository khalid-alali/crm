import { describe, expect, it } from 'vitest'
import { averageLaborRate, haversineMiles } from '@/lib/labor-rate-approval/benchmarks'

describe('haversineMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMiles(34.05, -118.25, 34.05, -118.25)).toBe(0)
  })

  it('computes a plausible LA to SF distance', () => {
    const miles = haversineMiles(34.0522, -118.2437, 37.7749, -122.4194)
    expect(miles).toBeGreaterThan(340)
    expect(miles).toBeLessThan(380)
  })
})

describe('averageLaborRate', () => {
  it('returns null for empty list', () => {
    expect(averageLaborRate([])).toBeNull()
  })

  it('averages shop rates', () => {
    expect(
      averageLaborRate([
        { standardLaborRate: 180 },
        { standardLaborRate: 200 },
        { standardLaborRate: 196 },
      ]),
    ).toBeCloseTo(192, 5)
  })
})
