import { describe, expect, it } from 'vitest'
import { pickFacilitySurvey } from '@/lib/shop-facility-survey'

describe('pickFacilitySurvey', () => {
  it('returns object embed as-is', () => {
    const row = { id: 'a', responses: {} }
    expect(pickFacilitySurvey(row)).toBe(row)
  })

  it('returns first array element', () => {
    const row = { id: 'a', responses: {} }
    expect(pickFacilitySurvey([row, { id: 'b', responses: {} }])).toBe(row)
  })

  it('returns null for empty', () => {
    expect(pickFacilitySurvey(null)).toBeNull()
    expect(pickFacilitySurvey([])).toBeNull()
  })
})
