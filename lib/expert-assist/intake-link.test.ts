import { describe, expect, it } from 'vitest'
import { buildExpertAssistIntakeHref } from '@/lib/expert-assist/intake-link'
import { EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID } from '@/lib/email-template-ids'

describe('buildExpertAssistIntakeHref', () => {
  it('builds preview URL with preview shop id', () => {
    const href = buildExpertAssistIntakeHref('https://intake.example.com', 'preview')
    expect(href).toContain(EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID)
    expect(href.startsWith('https://intake.example.com/?')).toBe(true)
  })

  it('builds real URL with location id and encoded name', () => {
    const href = buildExpertAssistIntakeHref(
      'https://intake.example.com/',
      'real',
      '550e8400-e29b-41d4-a716-446655440000',
      'Westside Auto',
    )
    expect(href).toContain('shop=550e8400-e29b-41d4-a716-446655440000')
    expect(href).toContain('name=Westside%20Auto')
  })
})
