import {
  CAPABILITIES_LINK_DISPLAY_SENTINEL,
  CAPABILITIES_LINK_PREVIEW_TOKEN,
} from '@/lib/email-template-ids'

export type CapabilitiesLinkMode = 'preview' | 'real'

/** Replaces `{{token}}` everywhere in HTML (body, subject, and inside `href="..."`). */
function replacePlaceholderTokens(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase()
    if (key in map) return map[key]!
    return `{{${rawKey}}}`
  })
}

/** Build href for capabilities / legacy portal placeholders. */
export function buildCapabilitiesHref(baseUrl: string, mode: CapabilitiesLinkMode, jwtToken?: string): string {
  const base = baseUrl.replace(/\/$/, '')
  if (mode === 'preview') {
    return `${base}/portal/${CAPABILITIES_LINK_PREVIEW_TOKEN}`
  }
  if (!jwtToken?.trim()) return `${base}/portal/${CAPABILITIES_LINK_PREVIEW_TOKEN}`
  return `${base}/portal/${jwtToken.trim()}`
}

/**
 * Replace `{{token}}` placeholders. Static keys come from `staticMap`.
 * `capabilitiesHref` is used for `capabilities_link` and legacy `portal_url`.
 */
export function replaceEmailTemplatePlaceholders(
  text: string,
  staticMap: Record<string, string>,
  capabilitiesHref: string,
): string {
  const map: Record<string, string> = {
    ...staticMap,
    capabilities_link: capabilitiesHref,
    portal_url: capabilitiesHref,
  }
  return replacePlaceholderTokens(text, map)
}

export function subjectAndBodyWithPlaceholders(
  subject: string,
  bodyHtml: string,
  staticMap: Record<string, string>,
  capabilitiesHref: string,
): { subject: string; bodyHtml: string } {
  return {
    subject: replaceEmailTemplatePlaceholders(subject, staticMap, capabilitiesHref),
    bodyHtml: replaceEmailTemplatePlaceholders(bodyHtml, staticMap, capabilitiesHref),
  }
}

/** Strip preview token path so we can inject a real JWT URL. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceCapabilitiesPreviewWithReal(
  text: string,
  previewHref: string,
  realHref: string,
): string {
  if (!previewHref) return text
  return text.split(previewHref).join(realHref)
}

/** Normalize older render output that used a real preview URL into the display sentinel. */
export function replaceLegacyCapabilitiesPreviewUrls(text: string): string {
  const esc = CAPABILITIES_LINK_PREVIEW_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(
    new RegExp(`https?:\\/\\/[^\\s"'<>]+\\/portal\\/${esc}`, 'g'),
    CAPABILITIES_LINK_DISPLAY_SENTINEL,
  )
}

export function emailContentReferencesCapabilitiesLink(subject: string, bodyHtml: string): boolean {
  const s = `${subject}\0${bodyHtml}`
  return (
    /\{\{\s*capabilities_link\s*\}\}/i.test(s) ||
    /\{\{\s*portal_url\s*\}\}/i.test(s) ||
    s.includes(CAPABILITIES_LINK_DISPLAY_SENTINEL) ||
    s.includes(`/portal/${CAPABILITIES_LINK_PREVIEW_TOKEN}`)
  )
}
