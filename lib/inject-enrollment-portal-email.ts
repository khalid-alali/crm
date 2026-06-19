import type { NextRequest } from 'next/server'
import { ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL } from '@/lib/email-template-ids'
import {
  buildEnrollmentPortalHref,
  emailContentReferencesEnrollmentPortalLink,
  replaceEmailTemplatePlaceholders,
} from '@/lib/email-template-placeholders'
import { portalBaseUrl } from '@/lib/portal-base-url'
import { signCapabilitiesPortalToken } from '@/lib/portal-token'

/**
 * Mint a fresh onboarding-portal URL and substitute the display sentinel,
 * `{{enrollment_portal_link}}`, and `{{enrollment_portal_url}}`.
 *
 * Isolated from the capabilities injector: it only fires when the email
 * references the enrollment placeholder, and writes the `/onboarding` surface.
 * (Same JWT as capabilities — both are per-location portal tokens.)
 */
export function injectEnrollmentPortalIntoEmail(
  req: NextRequest,
  locationId: string,
  subject: string,
  bodyHtml: string,
): { subject: string; bodyHtml: string } {
  if (!emailContentReferencesEnrollmentPortalLink(subject, bodyHtml)) {
    return { subject, bodyHtml }
  }

  const base = portalBaseUrl(req)
  const token = signCapabilitiesPortalToken(locationId)
  const realHref = buildEnrollmentPortalHref(base, token)

  let subjectOut = subject.split(ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL).join(realHref)
  let bodyOut = bodyHtml.split(ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL).join(realHref)
  const emptyStatic: Record<string, string> = {}
  subjectOut = replaceEmailTemplatePlaceholders(subjectOut, emptyStatic, { enrollmentPortal: realHref })
  bodyOut = replaceEmailTemplatePlaceholders(bodyOut, emptyStatic, { enrollmentPortal: realHref })

  return { subject: subjectOut, bodyHtml: bodyOut }
}
