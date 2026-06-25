import { NextRequest, NextResponse } from 'next/server'
import { verifyTechSurveyToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import { TECHNICIAN_SURVEY } from '@/lib/surveys/technician-survey'
import { missingRequired, type SurveyResponses } from '@/lib/surveys/types'

function inviteIdFromToken(techToken: string): string | null {
  try {
    return verifyTechSurveyToken(techToken).inviteId
  } catch {
    return null
  }
}

type InviteRow = {
  id: string
  location_id: string
  status: string
  draft_responses: SurveyResponses | null
}

// GET — load the tech's draft answers + shop context.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ techToken: string }> }) {
  const { techToken } = await params
  const inviteId = inviteIdFromToken(techToken)
  if (!inviteId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const { data } = await supabaseAdmin
    .from('tech_survey_invites')
    .select('id, location_id, status, draft_responses')
    .eq('id', inviteId)
    .maybeSingle()

  const invite = data as InviteRow | null
  if (!invite) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  const { data: loc } = await supabaseAdmin
    .from('locations')
    .select('name')
    .eq('id', invite.location_id)
    .maybeSingle()

  return NextResponse.json({
    responses: (invite.draft_responses ?? {}) as SurveyResponses,
    submitted: invite.status === 'completed',
    shopName: (loc as { name: string | null } | null)?.name ?? null,
  })
}

type PatchBody = { responses?: SurveyResponses; submit?: boolean }

// PATCH — autosave draft (submit:false) or finalize (submit:true).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ techToken: string }> }) {
  const { techToken } = await params
  const inviteId = inviteIdFromToken(techToken)
  if (!inviteId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const responses = (body.responses ?? {}) as SurveyResponses

  const { data } = await supabaseAdmin
    .from('tech_survey_invites')
    .select('id, location_id, status, draft_responses')
    .eq('id', inviteId)
    .maybeSingle()

  const invite = data as InviteRow | null
  if (!invite) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  // Already submitted — don't duplicate the competency row.
  if (invite.status === 'completed') {
    return NextResponse.json({ ok: true, submitted: true })
  }

  if (body.submit) {
    const missing = missingRequired(TECHNICIAN_SURVEY, responses)
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing ${missing.length} required answer(s)`, missing: missing.map(m => m.key) },
        { status: 400 },
      )
    }
  }

  // Always persist the latest draft, scoped by the token's invite id.
  {
    const { error } = await supabaseAdmin
      .from('tech_survey_invites')
      .update({ draft_responses: responses })
      .eq('id', invite.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!body.submit) {
    return NextResponse.json({ ok: true, submitted: false })
  }

  // Finalize: write the competency row, then mark the invite completed.
  const { data: loc } = await supabaseAdmin
    .from('locations')
    .select('name')
    .eq('id', invite.location_id)
    .maybeSingle()
  const shopName = (loc as { name: string | null } | null)?.name || 'Unknown shop'

  const fullName = String(responses.full_name ?? '').trim() || 'Unknown'
  const phone = responses.phone == null ? null : String(responses.phone)
  const email = responses.email == null ? null : String(responses.email)

  const { data: created, error: insertErr } = await supabaseAdmin
    .from('tech_competency_surveys')
    .insert({
      location_id: invite.location_id,
      tech_full_name: fullName,
      tech_phone: phone,
      tech_email: email,
      shop_name_raw: shopName,
      responses,
      source: 'portal',
    })
    .select('id')
    .single()
  if (insertErr || !created) {
    return NextResponse.json({ error: insertErr?.message || 'Could not save survey' }, { status: 500 })
  }

  const { error: updErr } = await supabaseAdmin
    .from('tech_survey_invites')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      tech_competency_survey_id: (created as { id: string }).id,
    })
    .eq('id', invite.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, submitted: true })
}
