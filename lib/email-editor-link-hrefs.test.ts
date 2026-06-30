import { describe, expect, it } from 'vitest'
import { ROUTABLE_BANK_LINK_PREVIEW_TOKEN } from './email-template-ids'
import { normalizeAutoLinkPlaceholderForEditor } from './email-editor-link-hrefs'

describe('normalizeAutoLinkPlaceholderForEditor', () => {
  it('uses absolute preview URLs for routable placeholders', () => {
    expect(
      normalizeAutoLinkPlaceholderForEditor('{{routable_bank_link}}', 'https://crm.example.com'),
    ).toBe(`https://crm.example.com/portal/${ROUTABLE_BANK_LINK_PREVIEW_TOKEN}`)
  })

  it('leaves normal URLs unchanged', () => {
    expect(normalizeAutoLinkPlaceholderForEditor('https://routable.com/x', 'https://crm.example.com')).toBe(
      'https://routable.com/x',
    )
  })
})
