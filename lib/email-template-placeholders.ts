import {
  CAPABILITIES_LINK_DISPLAY_SENTINEL,
  CAPABILITIES_LINK_PREVIEW_TOKEN,
  ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL,
  EXPERT_ASSIST_LINK_DISPLAY_SENTINEL,
  EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID,
  ROUTABLE_BANK_LINK_DISPLAY_SENTINEL,
  ROUTABLE_BANK_LINK_PREVIEW_TOKEN,
} from '@/lib/email-template-ids'
import { buildExpertAssistIntakeHref } from '@/lib/expert-assist/intake-link'

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
 * Build href for the enrollment (onboarding) portal placeholder. Same JWT as the
 * capabilities link, but the `/onboarding` surface. No preview token: the
 * `/portal/<token>` capabilities preview is a prefix of this path, so a shared
 * token would let the capabilities injector corrupt this link via string replace.
 * The placeholder relies on its display sentinel + `{{enrollment_portal_link}}`.
 */
export function buildEnrollmentPortalHref(baseUrl: string, jwtToken: string): string {
  return `${baseUrl.replace(/\/$/, '')}/portal/${jwtToken.trim()}/onboarding`
}

/** Preview href for Routable bank-link emails — must be a real https URL so TipTap keeps the anchor. */
export function buildRoutableBankLinkPreviewHref(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/portal/${ROUTABLE_BANK_LINK_PREVIEW_TOKEN}`
}

export type EmailTemplateLinkHrefs = {
  capabilities?: string
  expertAssist?: string
  enrollmentPortal?: string
  routableBankLink?: string
}

/**
 * Replace `{{token}}` placeholders. Static keys come from `staticMap`.
 * `capabilities` is used for `capabilities_link` and legacy `portal_url`.
 * `expertAssist`, when set, fills `expert_assist_link`.
 */
export function replaceEmailTemplatePlaceholders(
  text: string,
  staticMap: Record<string, string>,
  linkHrefs: string | EmailTemplateLinkHrefs,
): string {
  const hrefs: EmailTemplateLinkHrefs =
    typeof linkHrefs === 'string' ? { capabilities: linkHrefs } : linkHrefs
  const map: Record<string, string> = { ...staticMap }
  if (hrefs.capabilities) {
    map.capabilities_link = hrefs.capabilities
    map.portal_url = hrefs.capabilities
  }
  if (hrefs.expertAssist) map.expert_assist_link = hrefs.expertAssist
  if (hrefs.enrollmentPortal) {
    map.enrollment_portal_link = hrefs.enrollmentPortal
    map.enrollment_portal_url = hrefs.enrollmentPortal
  }
  if (hrefs.routableBankLink) {
    map.routable_bank_link = hrefs.routableBankLink
    map.bank_link = hrefs.routableBankLink
    map.connect_bank_account_link = hrefs.routableBankLink
  }
  return replacePlaceholderTokens(text, map)
}

export function subjectAndBodyWithPlaceholders(
  subject: string,
  bodyHtml: string,
  staticMap: Record<string, string>,
  linkHrefs: string | EmailTemplateLinkHrefs,
): { subject: string; bodyHtml: string } {
  return {
    subject: replaceEmailTemplatePlaceholders(subject, staticMap, linkHrefs),
    bodyHtml: replaceEmailTemplatePlaceholders(bodyHtml, staticMap, linkHrefs),
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

export function replaceRoutableBankLinkPreviewWithReal(
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

/** Normalize older render output that used a real preview URL into the display sentinel. */
export function replaceLegacyRoutableBankLinkPreviewUrls(text: string): string {
  const esc = ROUTABLE_BANK_LINK_PREVIEW_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(
    new RegExp(`https?:\\/\\/[^\\s"'<>]+\\/portal\\/${esc}`, 'g'),
    ROUTABLE_BANK_LINK_DISPLAY_SENTINEL,
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

export function emailContentReferencesEnrollmentPortalLink(subject: string, bodyHtml: string): boolean {
  const s = `${subject}\0${bodyHtml}`
  return (
    /\{\{\s*enrollment_portal_link\s*\}\}/i.test(s) ||
    /\{\{\s*enrollment_portal_url\s*\}\}/i.test(s) ||
    s.includes(ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL)
  )
}

export function emailContentReferencesRoutableBankLink(subject: string, bodyHtml: string): boolean {
  const s = `${subject}\0${bodyHtml}`
  const previewEsc = ROUTABLE_BANK_LINK_PREVIEW_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    /\{\{\s*routable_bank_link\s*\}\}/i.test(s) ||
    /\{\{\s*bank_link\s*\}\}/i.test(s) ||
    /\{\{\s*connect_bank_account_link\s*\}\}/i.test(s) ||
    s.includes(ROUTABLE_BANK_LINK_DISPLAY_SENTINEL) ||
    new RegExp(`/portal/${previewEsc}`, 'i').test(s)
  )
}

export function replaceExpertAssistPreviewWithReal(
  text: string,
  previewHref: string,
  realHref: string,
): string {
  if (!previewHref) return text
  return text.split(previewHref).join(realHref)
}

/** Normalize older render output that used a real preview intake URL into the display sentinel. */
export function replaceLegacyExpertAssistPreviewUrls(text: string, intakeBaseUrl?: string): string {
  const esc = EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = text
  if (intakeBaseUrl?.trim()) {
    const previewHref = buildExpertAssistIntakeHref(intakeBaseUrl, 'preview')
    out = out.split(previewHref).join(EXPERT_ASSIST_LINK_DISPLAY_SENTINEL)
  }
  out = out.replace(
    new RegExp(`https?:\\/\\/[^\\s"'<>]*[?&]shop=${esc}(?:&[^\\s"'<>#]*)?`, 'gi'),
    EXPERT_ASSIST_LINK_DISPLAY_SENTINEL,
  )
  return out
}

export function emailContentReferencesExpertAssistLink(subject: string, bodyHtml: string): boolean {
  const s = `${subject}\0${bodyHtml}`
  return (
    /\{\{\s*expert_assist_link\s*\}\}/i.test(s) ||
    s.includes(EXPERT_ASSIST_LINK_DISPLAY_SENTINEL) ||
    s.includes(EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID)
  )
}
