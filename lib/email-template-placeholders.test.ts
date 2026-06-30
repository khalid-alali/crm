import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES_LINK_DISPLAY_SENTINEL,
  ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL,
  ROUTABLE_BANK_LINK_DISPLAY_SENTINEL,
  ROUTABLE_BANK_LINK_PREVIEW_TOKEN,
} from './email-template-ids'
import {
  buildCapabilitiesHref,
  buildEnrollmentPortalHref,
  emailContentReferencesEnrollmentPortalLink,
  emailHasUnreplacedRoutableBankLink,
  replaceCapabilitiesPreviewWithReal,
  replaceEmailTemplatePlaceholders,
  replaceLegacyCapabilitiesPreviewUrls,
  subjectAndBodyWithPlaceholders,
} from './email-template-placeholders'

describe('enrollment portal placeholder (isolated from capabilities)', () => {
  it('builds the /onboarding href from the token', () => {
    expect(buildEnrollmentPortalHref('https://app.example.com/', 'abc.jwt')).toBe(
      'https://app.example.com/portal/abc.jwt/onboarding',
    )
  })

  it('substitutes enrollment_portal_link and _url, leaving capabilities untouched', () => {
    const out = replaceEmailTemplatePlaceholders(
      '<a href="{{enrollment_portal_link}}">Track</a> <a href="{{capabilities_link}}">Profile</a>',
      {},
      { enrollmentPortal: 'https://x/portal/t/onboarding', capabilities: 'https://x/portal/t' },
    )
    expect(out).toContain('href="https://x/portal/t/onboarding"')
    expect(out).toContain('href="https://x/portal/t"')
  })

  it('does not fill enrollment placeholder when only capabilities href is provided', () => {
    const out = replaceEmailTemplatePlaceholders('{{enrollment_portal_link}}', {}, { capabilities: 'https://x/portal/t' })
    expect(out).toBe('{{enrollment_portal_link}}')
  })

  it('detects references via placeholder or display sentinel', () => {
    expect(emailContentReferencesEnrollmentPortalLink('hi', '{{enrollment_portal_url}}')).toBe(true)
    expect(emailContentReferencesEnrollmentPortalLink('hi', ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL)).toBe(true)
    expect(emailContentReferencesEnrollmentPortalLink('hi', '{{capabilities_link}}')).toBe(false)
  })
})

describe('replaceEmailTemplatePlaceholders', () => {
  it('substitutes capabilities_link inside href without changing anchor text', () => {
    const map = {
      contact_first_name: 'Ada',
      contact_full_name: 'Ada Lovelace',
      contact_name: 'Ada Lovelace',
      shop_name: 'Acme',
      shop_address: '1 Main, San Francisco, CA 94102',
      shop_city: 'SF',
      shop_state: 'CA',
      sender_first_name: 'Leo',
      sender_full_name: 'Leo Gomez',
      sender_name: 'Leo Gomez',
    }
    const href = 'https://shop.fixlane.com/portal/signed.jwt'
    const html =
      '<p>Please <a href="{{capabilities_link}}">complete your shop capabilities form</a> today.</p>'
    const out = replaceEmailTemplatePlaceholders(html, map, href)
    expect(out).toBe(
      '<p>Please <a href="https://shop.fixlane.com/portal/signed.jwt">complete your shop capabilities form</a> today.</p>',
    )
  })

  it('replaces static merge keys case-insensitively', () => {
    const map = {
      contact_first_name: 'Ada',
      contact_full_name: 'Ada Lovelace',
      contact_name: 'Ada Lovelace',
      shop_name: 'Test Shop',
      shop_address: '100 Oak St, SF, CA',
      shop_city: 'SF',
      shop_state: 'CA',
      sender_first_name: 'Leo',
      sender_full_name: 'Leo Gomez',
      sender_name: 'Leo Gomez',
    }
    const href = 'https://app.example.com/portal/__crm_capabilities_preview__'
    const out = replaceEmailTemplatePlaceholders(
      'Hi {{Contact_First_Name}} at {{shop_name}}',
      map,
      href,
    )
    expect(out).toBe('Hi Ada at Test Shop')
  })

  it('leaves unknown tokens unchanged', () => {
    const out = replaceEmailTemplatePlaceholders('{{unknown_key}}', {}, 'http://x/preview')
    expect(out).toBe('{{unknown_key}}')
  })

  it('maps portal_url to capabilities href', () => {
    const href = 'https://app.example.com/portal/preview'
    const out = replaceEmailTemplatePlaceholders('<a href="{{portal_url}}">x</a>', {}, href)
    expect(out).toBe('<a href="https://app.example.com/portal/preview">x</a>')
  })

  it('substitutes expert_assist_link when provided', () => {
    const intake = 'https://intake.example.com/?shop=uuid&name=Acme'
    const out = replaceEmailTemplatePlaceholders(
      '<a href="{{expert_assist_link}}">Start consult</a>',
      {},
      { expertAssist: intake },
    )
    expect(out).toBe(`<a href="${intake}">Start consult</a>`)
  })
})

describe('buildCapabilitiesHref', () => {
  it('uses preview token when mode is preview', () => {
    expect(buildCapabilitiesHref('https://app.example.com/', 'preview')).toContain('__crm_capabilities_preview__')
  })

  it('uses jwt when mode is real', () => {
    expect(buildCapabilitiesHref('https://app.example.com/', 'real', 'abc.jwt')).toBe(
      'https://app.example.com/portal/abc.jwt',
    )
  })
})

describe('subjectAndBodyWithPlaceholders', () => {
  it('applies to both subject and body', () => {
    const r = subjectAndBodyWithPlaceholders(
      'Hello {{shop_name}}',
      '<p>{{shop_name}}</p>',
      { shop_name: 'Acme', shop_address: '', contact_first_name: 'x', contact_full_name: 'x', contact_name: 'x', shop_city: '', shop_state: '', sender_first_name: 'y', sender_full_name: 'y', sender_name: 'y' },
      'http://p',
    )
    expect(r.subject).toBe('Hello Acme')
    expect(r.bodyHtml).toBe('<p>Acme</p>')
  })
})

describe('replaceCapabilitiesPreviewWithReal', () => {
  it('swaps preview href for real', () => {
    const preview = 'https://x/portal/__crm_capabilities_preview__'
    const real = 'https://x/portal/real.jwt'
    expect(replaceCapabilitiesPreviewWithReal(`<a href="${preview}">`, preview, real)).toBe(`<a href="${real}">`)
  })
})

describe('replaceLegacyCapabilitiesPreviewUrls', () => {
  it('replaces preview portal URLs with the display sentinel', () => {
    const raw =
      '<p>See <a href="http://localhost:3000/portal/__crm_capabilities_preview__">link</a> and http://localhost:3000/portal/__crm_capabilities_preview__</p>'
    const out = replaceLegacyCapabilitiesPreviewUrls(raw)
    expect(out).not.toContain('__crm_capabilities_preview__')
    expect(out).toContain(CAPABILITIES_LINK_DISPLAY_SENTINEL)
    expect(out.split(CAPABILITIES_LINK_DISPLAY_SENTINEL).length).toBeGreaterThan(2)
  })
})

describe('emailHasUnreplacedRoutableBankLink', () => {
  it('flags merge placeholders, sentinels, and preview URLs', () => {
    expect(emailHasUnreplacedRoutableBankLink('hi', '<a href="{{routable_bank_link}}">')).toBe(true)
    expect(emailHasUnreplacedRoutableBankLink('hi', ROUTABLE_BANK_LINK_DISPLAY_SENTINEL)).toBe(true)
    expect(
      emailHasUnreplacedRoutableBankLink(
        'hi',
        `<a href="https://app.example.com/portal/${ROUTABLE_BANK_LINK_PREVIEW_TOKEN}">`,
      ),
    ).toBe(true)
  })

  it('passes when only a real Routable URL remains', () => {
    expect(
      emailHasUnreplacedRoutableBankLink(
        'Welcome',
        '<a href="https://routable.com/flow/abc123">Connect your bank account</a>',
      ),
    ).toBe(false)
  })
})
