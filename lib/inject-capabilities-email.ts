import type { NextRequest } from 'next/server'
import { CAPABILITIES_LINK_DISPLAY_SENTINEL } from '@/lib/email-template-ids'
import {
  buildCapabilitiesHref,
  replaceCapabilitiesPreviewWithReal,
  replaceEmailTemplatePlaceholders,
} from '@/lib/email-template-placeholders'
import { portalBaseUrl } from '@/lib/portal-base-url'
import { signCapabilitiesPortalToken } from '@/lib/portal-token'

/**
 * Mint a fresh portal URL and substitute preview URLs, display sentinel,
 * `{{capabilities_link}}`, and `{{portal_url}}`.
 */
export function injectCapabilitiesIntoEmail(
  req: NextRequest,
  locationId: string,
  subject: string,
  bodyHtml: string,
): { subject: string; bodyHtml: string } {
  const base = portalBaseUrl(req)
  const previewHref = buildCapabilitiesHref(base, 'preview')
  const combined = `${subject}\0${bodyHtml}`
  const needsInject =
    combined.includes(previewHref) ||
    combined.includes(CAPABILITIES_LINK_DISPLAY_SENTINEL) ||
    /\{\{\s*capabilities_link\s*\}\}/i.test(combined) ||
    /\{\{\s*portal_url\s*\}\}/i.test(combined)

  if (!needsInject) {
    return { subject, bodyHtml }
  }

  const token = signCapabilitiesPortalToken(locationId)
  const realHref = buildCapabilitiesHref(base, 'real', token)

  let subjectOut = replaceCapabilitiesPreviewWithReal(subject, previewHref, realHref)
  let bodyOut = replaceCapabilitiesPreviewWithReal(bodyHtml, previewHref, realHref)
  subjectOut = subjectOut.split(CAPABILITIES_LINK_DISPLAY_SENTINEL).join(realHref)
  bodyOut = bodyOut.split(CAPABILITIES_LINK_DISPLAY_SENTINEL).join(realHref)
  const emptyStatic: Record<string, string> = {}
  subjectOut = replaceEmailTemplatePlaceholders(subjectOut, emptyStatic, realHref)
  bodyOut = replaceEmailTemplatePlaceholders(bodyOut, emptyStatic, realHref)

  return { subject: subjectOut, bodyHtml: bodyOut }
}
