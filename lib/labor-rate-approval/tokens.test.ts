import { describe, expect, it } from 'vitest'
import { generateDecisionToken } from '@/lib/labor-rate-approval/tokens'

describe('generateDecisionToken', () => {
  it('returns unique url-safe tokens', () => {
    const a = generateDecisionToken()
    const b = generateDecisionToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(20)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
