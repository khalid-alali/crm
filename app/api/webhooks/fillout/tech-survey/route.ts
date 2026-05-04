import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { secureTokenEquals } from '@/lib/secure-token'

/** Question ids for the current Fillout "Technician evaluation" form (stable unless the form is rebuilt). */
const Q = {
  fullName: '7WV3',
  shopName: 'msRv',
  phone: 'bguv',
  email: '273A',
} as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) return ''
  const [scheme, token] = authorizationHeader.split(/\s+/, 2)
  if (!scheme || !token) return ''
  return scheme.toLowerCase() === 'bearer' ? token.trim() : ''
}

function tokenFromRequest(req: NextRequest): string {
  const fromBearer = getBearerToken(req.headers.get('authorization'))
  if (fromBearer) return fromBearer
  const fromHeader = req.headers.get('x-fillout-webhook-secret')
  if (fromHeader?.trim()) return fromHeader.trim()
  return req.nextUrl.searchParams.get('token')?.trim() ?? ''
}

function isAuthorizedRequest(req: NextRequest): boolean {
  const expected = process.env.FILLOUT_TECH_SURVEY_WEBHOOK_SECRET?.trim() ?? ''
  if (!expected) return false
  const provided = tokenFromRequest(req)
  if (!provided) return false
  return secureTokenEquals(provided, expected)
}

function normalizeStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

function valueFromQuestions(
  questions: unknown[],
  byId: Map<string, unknown>,
  nameNeedle: string,
): string {
  const fromId =
    nameNeedle === 'Full Name'
      ? normalizeStr(byId.get(Q.fullName))
      : nameNeedle === 'Shop Name'
        ? normalizeStr(byId.get(Q.shopName))
        : nameNeedle === 'Phone Number'
          ? normalizeStr(byId.get(Q.phone))
          : nameNeedle === 'Email'
            ? normalizeStr(byId.get(Q.email))
            : ''
  if (fromId) return fromId
  const lower = nameNeedle.toLowerCase()
  for (const q of questions) {
    if (!isRecord(q)) continue
    const n = normalizeStr(q.name).toLowerCase()
    if (n === lower) return normalizeStr(q.value)
  }
  return ''
}

function urlParamMap(urlParameters: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(urlParameters)) return out
  for (const p of urlParameters) {
    if (!isRecord(p)) continue
    const key = normalizeStr(p.name) || normalizeStr(p.id)
    const val = normalizeStr(p.value)
    if (key && val) out[key] = val
  }
  return out
}

type ResolveResult =
  | { ok: true; locationId: string; matchMethod: string; matchDetail: string }
  | { ok: false; error: string; status: number }

async function resolveLocation(
  shopIdParam: string,
  shopNameFromForm: string,
  shopNameFromUrl: string,
): Promise<ResolveResult> {
  const byName = (shopNameFromForm || shopNameFromUrl).trim()

  if (shopIdParam && UUID_RE.test(shopIdParam)) {
    const { data: byPk, error: e1 } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('id', shopIdParam)
      .maybeSingle()
    if (e1) return { ok: false, error: e1.message, status: 500 }
    if (byPk?.id) {
      return {
        ok: true,
        locationId: byPk.id,
        matchMethod: 'location_id',
        matchDetail: shopIdParam,
      }
    }

    const { data: byMd, error: e2 } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('motherduck_shop_id', shopIdParam)
      .maybeSingle()
    if (e2) return { ok: false, error: e2.message, status: 500 }
    if (byMd?.id) {
      return {
        ok: true,
        locationId: byMd.id,
        matchMethod: 'motherduck_shop_id',
        matchDetail: shopIdParam,
      }
    }
  }

  if (!byName) {
    return {
      ok: false,
      error:
        'Could not resolve location: pass shop_id (location UUID or motherduck id) in the form URL, or Shop Name / shop URL parameter.',
      status: 400,
    }
  }

  const { data: rows, error: e3 } = await supabaseAdmin
    .from('locations')
    .select('id')
    .ilike('name', byName)

  if (e3) return { ok: false, error: e3.message, status: 500 }
  if (!rows?.length) {
    return {
      ok: false,
      error: `No location found matching shop name "${byName}".`,
      status: 400,
    }
  }
  if (rows.length > 1) {
    return {
      ok: false,
      error: `Multiple locations match shop name "${byName}"; use shop_id in the form URL.`,
      status: 409,
    }
  }

  return {
    ok: true,
    locationId: rows[0].id,
    matchMethod: 'location_name_ilike',
    matchDetail: byName,
  }
}

async function resolveContactId(
  locationId: string,
  accountId: string | null,
  email: string,
): Promise<string | null> {
  const em = email.trim().toLowerCase()
  if (!em) return null

  const { data: atLocation } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('location_id', locationId)
    .ilike('email', em)
    .limit(1)

  if (atLocation?.[0]?.id) return atLocation[0].id

  if (accountId) {
    const { data: atAccount } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .ilike('email', em)
      .limit(1)
    if (atAccount?.[0]?.id) return atAccount[0].id
  }

  return null
}

export async function POST(req: NextRequest) {
  const secret = process.env.FILLOUT_TECH_SURVEY_WEBHOOK_SECRET?.trim() ?? ''
  if (!secret) {
    return NextResponse.json(
      { error: 'Server misconfigured: FILLOUT_TECH_SURVEY_WEBHOOK_SECRET is missing.' },
      { status: 500 },
    )
  }

  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const submission = body.submission
  if (!isRecord(submission)) {
    return NextResponse.json({ error: 'Missing submission object' }, { status: 400 })
  }

  const questionsRaw = submission.questions
  const questions = Array.isArray(questionsRaw) ? questionsRaw : []
  const byId = new Map<string, unknown>()
  for (const q of questions) {
    if (!isRecord(q)) continue
    const id = normalizeStr(q.id)
    if (id) byId.set(id, q.value)
  }

  const urlParams = urlParamMap(submission.urlParameters)

  const techFullName =
    valueFromQuestions(questions, byId, 'Full Name') || urlParams.name || ''
  const shopNameRaw =
    valueFromQuestions(questions, byId, 'Shop Name') ||
    urlParams.shop ||
    ''
  const techPhone =
    valueFromQuestions(questions, byId, 'Phone Number') || urlParams.phone || ''
  const techEmail = (
    valueFromQuestions(questions, byId, 'Email') ||
    urlParams.email ||
    ''
  )
    .trim()
    .toLowerCase()

  if (!techFullName) {
    return NextResponse.json(
      { error: 'Full Name is required (form field or URL parameter name).' },
      { status: 400 },
    )
  }

  const resolved = await resolveLocation(
    urlParams.shop_id ?? '',
    shopNameRaw,
    urlParams.shop ?? '',
  )
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  const { data: locationRow, error: locErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, account_id')
    .eq('id', resolved.locationId)
    .single()

  if (locErr || !locationRow) {
    return NextResponse.json({ error: locErr?.message ?? 'Location not found' }, { status: 500 })
  }

  const finalShopNameRaw = (shopNameRaw || locationRow.name || 'Unknown shop').trim()

  const submissionId = normalizeStr(submission.submissionId)
  if (submissionId) {
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('tech_competency_surveys')
      .select('id')
      .eq('source', 'fillout')
      .eq('responses->>submissionId', submissionId)
      .maybeSingle()

    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 })
    }
    if (existing?.id) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id }, { status: 200 })
    }
  }

  const contactId = await resolveContactId(
    locationRow.id,
    locationRow.account_id,
    techEmail,
  )

  const matchDetailCombined =
    contactId != null
      ? `${resolved.matchDetail}; contact matched by email`
      : resolved.matchDetail

  const responses = {
    formId: body.formId ?? null,
    formName: body.formName ?? null,
    submissionId: submission.submissionId ?? null,
    submissionTime: submission.submissionTime ?? null,
    lastUpdatedAt: submission.lastUpdatedAt ?? null,
    questions: submission.questions ?? [],
    urlParameters: submission.urlParameters ?? [],
    calculations: submission.calculations ?? [],
    urlParametersMap: urlParams,
    quiz: submission.quiz ?? {},
    documents: submission.documents ?? [],
    scheduling: submission.scheduling ?? [],
    payments: submission.payments ?? [],
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('tech_competency_surveys')
    .insert({
      location_id: locationRow.id,
      contact_id: contactId,
      tech_full_name: techFullName,
      tech_phone: techPhone || null,
      tech_email: techEmail || null,
      shop_name_raw: finalShopNameRaw,
      responses,
      match_method: contactId ? `${resolved.matchMethod}+contact_email` : resolved.matchMethod,
      match_detail: matchDetailCombined,
      source: 'fillout',
    })
    .select('id, created_at')
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, survey: inserted }, { status: 201 })
}
