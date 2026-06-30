import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROUTABLE_BANK_LINK_DISPLAY_SENTINEL } from '@/lib/email-template-ids'
import {
  buildEnrollmentPortalHref,
  buildRoutableBankLinkPreviewHref,
  emailContentReferencesRoutableBankLink,
  replaceEmailTemplatePlaceholders,
  replaceRoutableBankLinkPreviewWithReal,
} from '@/lib/email-template-placeholders'
import { portalBaseUrl } from '@/lib/portal-base-url'
import { signCapabilitiesPortalToken } from '@/lib/portal-token'
import {
  isRoutableBankLinked,
  ROUTABLE_LOCATION_SELECT,
  startEmbeddedBankLinkFlow,
  type RoutableLocationRow,
} from '@/lib/routable-bank-gate'
import { routableCredentialsFromEnv } from '@/lib/routable'
import { supabaseAdmin } from '@/lib/supabase'

export type RoutableBankLinkHrefSource = 'routable_embedded' | 'portal_fallback' | 'portal_unlocked'

export type MintRoutableBankLinkResult = {
  href: string
  source: RoutableBankLinkHrefSource
}

/**
 * Mint the bank-link CTA for E2/E3. When Routable is ready, returns the embedded
 * flow URL (with confirmation redirect back to the portal). Otherwise falls back
 * to the enrollment portal so the email still sends.
 */
export async function mintRoutableBankLinkHrefForEmail(
  admin: SupabaseClient,
  req: NextRequest,
  locationId: string,
): Promise<MintRoutableBankLinkResult> {
  const { data, error } = await admin
    .from('locations')
    .select(ROUTABLE_LOCATION_SELECT)
    .eq('id', locationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Shop not found')

  const location = data as RoutableLocationRow
  const base = portalBaseUrl(req)
  const portalToken = signCapabilitiesPortalToken(locationId)
  const portalHref = buildEnrollmentPortalHref(base, portalToken)

  if (isRoutableBankLinked(location)) {
    return { href: portalHref, source: 'portal_unlocked' }
  }

  const companyId = typeof location.routable_id === 'string' ? location.routable_id.trim() : ''
  const creds = routableCredentialsFromEnv()
  if (!companyId || !creds) {
    return { href: portalHref, source: 'portal_fallback' }
  }

  const { externalFlowUrl } = await startEmbeddedBankLinkFlow({
    admin,
    location,
    portalBaseUrl: base,
    portalToken,
    creds,
  })

  return { href: externalFlowUrl, source: 'routable_embedded' }
}

/**
 * Mint a Routable embedded bank-link URL and substitute the preview URL, display
 * sentinel, and `{{routable_bank_link}}` placeholders.
 */
export async function injectRoutableBankLinkIntoEmail(
  req: NextRequest,
  locationId: string,
  subject: string,
  bodyHtml: string,
): Promise<{ subject: string; bodyHtml: string }> {
  if (!emailContentReferencesRoutableBankLink(subject, bodyHtml)) {
    return { subject, bodyHtml }
  }

  const base = portalBaseUrl(req)
  const previewHref = buildRoutableBankLinkPreviewHref(base)
  const { href: realHref } = await mintRoutableBankLinkHrefForEmail(supabaseAdmin, req, locationId)

  let subjectOut = replaceRoutableBankLinkPreviewWithReal(subject, previewHref, realHref)
  let bodyOut = replaceRoutableBankLinkPreviewWithReal(bodyHtml, previewHref, realHref)
  subjectOut = subjectOut.split(ROUTABLE_BANK_LINK_DISPLAY_SENTINEL).join(realHref)
  bodyOut = bodyOut.split(ROUTABLE_BANK_LINK_DISPLAY_SENTINEL).join(realHref)
  const emptyStatic: Record<string, string> = {}
  subjectOut = replaceEmailTemplatePlaceholders(subjectOut, emptyStatic, { routableBankLink: realHref })
  bodyOut = replaceEmailTemplatePlaceholders(bodyOut, emptyStatic, { routableBankLink: realHref })

  return { subject: subjectOut, bodyHtml: bodyOut }
}
