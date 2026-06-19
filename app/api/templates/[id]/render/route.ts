import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import {
  buildEmailMergeContext,
  emailMergeWarningsForVinfastPlaceholders,
  mergeContextToStaticMap,
} from '@/lib/email-template-merge'
import {
  CAPABILITIES_LINK_DISPLAY_SENTINEL,
  ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL,
  EXPERT_ASSIST_LINK_DISPLAY_SENTINEL,
} from '@/lib/email-template-ids'
import { buildExpertAssistIntakeHref, expertAssistIntakePublicUrl } from '@/lib/expert-assist/intake-link'
import { subjectAndBodyWithPlaceholders } from '@/lib/email-template-placeholders'
import { supabaseAdmin } from '@/lib/supabase'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { locationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : ''
  if (!locationId) {
    return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
  }

  const { data: template, error: tErr } = await supabaseAdmin
    .from('email_templates')
    .select('id, name, subject, body_html, default_recipients, default_cc_recipients, archived')
    .eq('id', id.trim())
    .eq('archived', false)
    .maybeSingle()

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const mergeCtx = await buildEmailMergeContext(supabaseAdmin, locationId, session)
  if (!mergeCtx) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const staticMap = mergeContextToStaticMap(mergeCtx)
  const intakeBase = expertAssistIntakePublicUrl(req)
  const expertAssistPreview =
    intakeBase ?
      buildExpertAssistIntakeHref(intakeBase, 'preview')
    : EXPERT_ASSIST_LINK_DISPLAY_SENTINEL
  const rendered = subjectAndBodyWithPlaceholders(template.subject, template.body_html, staticMap, {
    capabilities: CAPABILITIES_LINK_DISPLAY_SENTINEL,
    expertAssist: expertAssistPreview,
    enrollmentPortal: ENROLLMENT_PORTAL_LINK_DISPLAY_SENTINEL,
  })

  const warnings = emailMergeWarningsForVinfastPlaceholders(
    template.subject,
    template.body_html,
    mergeCtx,
  )

  return NextResponse.json({
    templateId: template.id,
    templateName: template.name,
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    defaultRecipients: template.default_recipients ?? [],
    defaultCcRecipients: template.default_cc_recipients ?? [],
    warnings,
  })
}
