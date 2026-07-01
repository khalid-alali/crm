import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ROUTABLE_BANK_LINK_DISPLAY_SENTINEL } from '@/lib/email-template-ids'
import {
  buildRoutableBankLinkPreviewHref,
  emailContentReferencesRoutableBankLink,
  replaceEmailTemplatePlaceholders,
} from '@/lib/email-template-placeholders'

const { mockStartEmbedded, mockIsLinked, mockSignToken, mockMaybeSingle } = vi.hoisted(() => ({
  mockStartEmbedded: vi.fn(),
  mockIsLinked: vi.fn(),
  mockSignToken: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/routable-bank-gate', () => ({
  ROUTABLE_LOCATION_SELECT: 'id, routable_id',
  isRoutableBankLinked: (...args: unknown[]) => mockIsLinked(...args),
  startEmbeddedBankLinkFlow: (...args: unknown[]) => mockStartEmbedded(...args),
}))

vi.mock('@/lib/routable', () => ({
  routableCredentialsFromEnv: () => ({ apiKey: 'k', teamMemberId: 'tm' }),
}))

vi.mock('@/lib/portal-token', () => ({
  signCapabilitiesPortalToken: (...args: unknown[]) => mockSignToken(...args),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
        }),
      }),
    }),
  },
}))

import { injectRoutableBankLinkIntoEmail } from '@/lib/inject-routable-bank-link-email'

function fakeReq() {
  return { headers: new Headers() } as import('next/server').NextRequest
}

describe('emailContentReferencesRoutableBankLink', () => {
  it('detects placeholder and sentinel', () => {
    expect(emailContentReferencesRoutableBankLink('x', '{{routable_bank_link}}')).toBe(true)
    expect(emailContentReferencesRoutableBankLink('x', ROUTABLE_BANK_LINK_DISPLAY_SENTINEL)).toBe(true)
    expect(emailContentReferencesRoutableBankLink('x', '{{bank_link}}')).toBe(true)
  })
})

describe('replaceEmailTemplatePlaceholders routableBankLink', () => {
  it('fills routable_bank_link and aliases', () => {
    const href = 'https://routable.example/flow/xyz'
    const out = replaceEmailTemplatePlaceholders(
      '<a href="{{routable_bank_link}}">{{bank_link}}</a>',
      {},
      { routableBankLink: href },
    )
    expect(out).toBe(`<a href="${href}">${href}</a>`)
  })
})

describe('injectRoutableBankLinkIntoEmail', () => {
  beforeEach(() => {
    mockIsLinked.mockReturnValue(false)
    mockSignToken.mockReturnValue('jwt.token')
    mockStartEmbedded.mockReset()
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'loc-1', routable_id: 'co_abc', routable_payment_method_count: 0 },
      error: null,
    })
    mockStartEmbedded.mockResolvedValue({
      externalFlowUrl: 'https://routable.example/flow/live',
      snapshot: {},
    })
  })

  it('no-ops when template has no routable placeholder', async () => {
    const out = await injectRoutableBankLinkIntoEmail(fakeReq(), 'loc-1', 'Hi', '<p>plain</p>')
    expect(out.bodyHtml).toBe('<p>plain</p>')
    expect(mockStartEmbedded).not.toHaveBeenCalled()
  })

  it('mints embedded flow URL on send', async () => {
    const out = await injectRoutableBankLinkIntoEmail(
      fakeReq(),
      'loc-1',
      'Hi',
      '<a href="{{routable_bank_link}}">Connect</a>',
    )
    expect(out.bodyHtml).toContain('https://routable.example/flow/live')
    expect(mockStartEmbedded).toHaveBeenCalledOnce()
  })

  it('replaces preview href on send', async () => {
    const preview = buildRoutableBankLinkPreviewHref('http://localhost:3000')
    const out = await injectRoutableBankLinkIntoEmail(
      fakeReq(),
      'loc-1',
      'Hi',
      `<a href="${preview}">Connect</a>`,
    )
    expect(out.bodyHtml).toContain('https://routable.example/flow/live')
    expect(out.bodyHtml).not.toContain('__crm_routable_bank_link_preview__')
  })

  it('uses portal when already linked', async () => {
    mockIsLinked.mockReturnValue(true)
    const out = await injectRoutableBankLinkIntoEmail(
      fakeReq(),
      'loc-1',
      'Hi',
      '<a href="{{routable_bank_link}}">Open</a>',
    )
    expect(out.bodyHtml).toContain('/portal/jwt.token/onboarding')
    expect(mockStartEmbedded).not.toHaveBeenCalled()
  })

  it('throws when shop has no routable_id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'loc-1', routable_id: null, routable_payment_method_count: 0 },
      error: null,
    })

    await expect(
      injectRoutableBankLinkIntoEmail(fakeReq(), 'loc-1', 'Hi', '<a href="{{routable_bank_link}}">Connect</a>'),
    ).rejects.toThrow(/no Routable ID/)
  })
})
