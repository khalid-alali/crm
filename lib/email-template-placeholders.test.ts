import { describe, expect, it } from 'vitest'
import { CAPABILITIES_LINK_DISPLAY_SENTINEL } from './email-template-ids'
import {
  buildCapabilitiesHref,
  replaceCapabilitiesPreviewWithReal,
  replaceEmailTemplatePlaceholders,
  replaceLegacyCapabilitiesPreviewUrls,
  subjectAndBodyWithPlaceholders,
} from './email-template-placeholders'

describe('replaceEmailTemplatePlaceholders', () => {
  it('substitutes capabilities_link inside href without changing anchor text', () => {
    const map = {
      contact_first_name: 'Ada',
      contact_full_name: 'Ada Lovelace',
      contact_name: 'Ada Lovelace',
      shop_name: 'Acme',
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
      { shop_name: 'Acme', contact_first_name: 'x', contact_full_name: 'x', contact_name: 'x', shop_city: '', shop_state: '', sender_first_name: 'y', sender_full_name: 'y', sender_name: 'y' },
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
