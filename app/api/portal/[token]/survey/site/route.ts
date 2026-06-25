import { NextRequest, NextResponse } from 'next/server'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import { SITE_SURVEY } from '@/lib/surveys/site-survey'
import { missingRequired, type SurveyResponses } from '@/lib/surveys/types'

function locationIdFromToken(token: string): string | null {
  try {
    return verifyCapabilitiesPortalToken(token).locationId
  } catch {
    return null
  }
}

// GET — prefill the owner's VinFast site survey.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const { data: loc } = await supabaseAdmin.from('locations').select('name').eq('id', locationId).maybeSingle()
  const { data: row } = await supabaseAdmin
    .from('shop_facility_surveys')
    .select('responses, submitted_at')
    .eq('location_id', locationId)
    .maybeSingle()

  const responses: SurveyResponses = ((row?.responses as SurveyResponses) ?? {}) as SurveyResponses
  if (responses.shop_name == null && loc?.name) responses.shop_name = loc.name

  return NextResponse.json({ responses, submitted_at: row?.submitted_at ?? null })
}

type SaveBody = { responses?: SurveyResponses; submit?: boolean }

// PATCH — autosave (submit:false) or final submit (submit:true).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  let body: SaveBody
  try {
    body = (await req.json()) as SaveBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const responses = (body.responses ?? {}) as SurveyResponses

  if (body.submit) {
    const missing = missingRequired(SITE_SURVEY, responses)
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing ${missing.length} required answer(s)`, missing: missing.map(m => m.key) },
        { status: 400 },
      )
    }
  }

  const { data: loc } = await supabaseAdmin.from('locations').select('name').eq('id', locationId).maybeSingle()
  const shopName =
    (typeof responses.shop_name === 'string' && responses.shop_name.trim()) || loc?.name || 'Unknown shop'

  const payload: Record<string, unknown> = {
    location_id: locationId,
    shop_name_raw: shopName,
    responses,
    source: 'portal',
  }
  if (body.submit) payload.submitted_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('shop_facility_surveys')
    .upsert(payload, { onConflict: 'location_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, submitted: body.submit === true })
}
