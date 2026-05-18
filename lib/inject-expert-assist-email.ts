import type { NextRequest } from 'next/server'

import { EXPERT_ASSIST_LINK_DISPLAY_SENTINEL } from '@/lib/email-template-ids'
import {
  buildExpertAssistIntakeHref,
  expertAssistIntakePublicUrl,
} from '@/lib/expert-assist/intake-link'
import {
  emailContentReferencesExpertAssistLink,
  replaceEmailTemplatePlaceholders,
  replaceExpertAssistPreviewWithReal,
} from '@/lib/email-template-placeholders'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Substitute preview URLs, display sentinel, and `{{expert_assist_link}}` with the
 * shop-specific Expert Assist intake URL (`?shop=<locationId>&name=…`).
 */
export async function injectExpertAssistIntoEmail(
  req: NextRequest,
  locationId: string,
  subject: string,
  bodyHtml: string,
): Promise<{ subject: string; bodyHtml: string }> {
  const combined = `${subject}\0${bodyHtml}`
  if (!emailContentReferencesExpertAssistLink(subject, bodyHtml)) {
    return { subject, bodyHtml }
  }

  const base = expertAssistIntakePublicUrl(req)
  if (!base) {
    throw new Error(
      'Set EXPERT_ASSIST_INTAKE_PUBLIC_URL before sending emails that use {{expert_assist_link}}',
    )
  }

  const { data: loc, error } = await supabaseAdmin
    .from('locations')
    .select('id, name')
    .eq('id', locationId)
    .maybeSingle()

  if (error || !loc) {
    throw new Error(error?.message ?? 'Shop not found for Expert Assist link')
  }

  const previewHref = buildExpertAssistIntakeHref(base, 'preview')
  const realHref = buildExpertAssistIntakeHref(
    base,
    'real',
    (loc as { id: string }).id,
    (loc as { name: string }).name,
  )

  let subjectOut = replaceExpertAssistPreviewWithReal(subject, previewHref, realHref)
  let bodyOut = replaceExpertAssistPreviewWithReal(bodyHtml, previewHref, realHref)
  subjectOut = subjectOut.split(EXPERT_ASSIST_LINK_DISPLAY_SENTINEL).join(realHref)
  bodyOut = bodyOut.split(EXPERT_ASSIST_LINK_DISPLAY_SENTINEL).join(realHref)
  const emptyStatic: Record<string, string> = {}
  subjectOut = replaceEmailTemplatePlaceholders(subjectOut, emptyStatic, { expertAssist: realHref })
  bodyOut = replaceEmailTemplatePlaceholders(bodyOut, emptyStatic, { expertAssist: realHref })

  return { subject: subjectOut, bodyHtml: bodyOut }
}
