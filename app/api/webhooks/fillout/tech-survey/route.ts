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

/** Prod-safe logging: keep secrets out of log drains. */
function maskSensitiveHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'authorization') {
      out[key] = /^Bearer\s+\S+/i.test(value) ? 'Bearer [redacted]' : '[redacted]'
    } else if (lower === 'x-fillout-webhook-secret') {
      out[key] = value ? '[redacted]' : ''
    } else if (lower === 'cookie') {
      out[key] = value ? '[redacted]' : ''
    } else {
      out[key] = value
    }
  })
  return out
}

function queryForLog(searchParams: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    if (key === 'token' && value.length > 12) {
      out[key] = `${value.slice(0, 4)}…${value.slice(-4)} (len ${value.length})`
    } else if (key === 'token') {
      out[key] = `[len ${value.length}]`
    } else {
      out[key] = value
    }
  })
  return out
}

function logFilloutWebhookUnauthorized(req: NextRequest, bodyLength: number) {
  console.log('[fillout-tech-survey] unauthorized', {
    at: new Date().toISOString(),
    method: req.method,
    query: queryForLog(req.nextUrl.searchParams),
    headers: maskSensitiveHeaders(req.headers),
    bodyLength,
  })
}

function logFilloutWebhookIncoming(req: NextRequest, body: unknown) {
  console.log('[fillout-tech-survey] incoming', {
    at: new Date().toISOString(),
    method: req.method,
    contentType: req.headers.get('content-type'),
    query: queryForLog(req.nextUrl.searchParams),
    headers: maskSensitiveHeaders(req.headers),
    body,
  })
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

function looksLikeSubmissionRecord(r: Record<string, unknown>): boolean {
  if (Array.isArray(r.questions)) return true
  if (r.submissionTime != null) return true
  if (typeof r.submissionId === 'string' && r.submissionId.length > 0) return true
  return false
}

/** If Fillout wraps the payload one level down (varies by product / webhook version). */
function firstNestedObjectWithQuestions(body: Record<string, unknown>): Record<string, unknown> | null {
  for (const v of Object.values(body)) {
    if (!isRecord(v)) continue
    if (looksLikeSubmissionRecord(v)) return v
    if (isRecord(v.submission) && looksLikeSubmissionRecord(v.submission)) {
      return v.submission as Record<string, unknown>
    }
  }
  return null
}

/**
 * Normalize Fillout webhook JSON to a single `Submission` record (same idea as GET
 * `/forms/{formId}/submissions/{id}` → `{ submission: { ... } }`).
 *
 * Fails when Advanced webhook body is fully custom (no `questions` / `submission` shape).
 */
function extractSubmissionPayload(body: Record<string, unknown>): Record<string, unknown> | null {
  const tryCandidate = (c: unknown): Record<string, unknown> | null => {
    if (!isRecord(c)) return null
    if (isRecord(c.submission) && looksLikeSubmissionRecord(c.submission)) {
      return c.submission as Record<string, unknown>
    }
    if (looksLikeSubmissionRecord(c)) return c
    return null
  }

  const ordered: unknown[] = [
    body.submission,
    body.data,
    body.payload,
    body.record,
    body.result,
    body.event,
    Array.isArray(body.submissions) ? body.submissions[0] : null,
  ]

  for (const c of ordered) {
    const hit = tryCandidate(c)
    if (hit) return hit
  }

  if (looksLikeSubmissionRecord(body)) return body

  const nested = firstNestedObjectWithQuestions(body)
  if (nested) return nested

  return null
}

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

  const rawText = await req.text()

  if (!isAuthorizedRequest(req)) {
    logFilloutWebhookUnauthorized(req, rawText.length)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  if (!rawText.trim()) {
    logFilloutWebhookIncoming(req, null)
    return NextResponse.json({ error: 'Empty JSON body' }, { status: 400 })
  }
  try {
    raw = JSON.parse(rawText) as unknown
  } catch {
    console.log('[fillout-tech-survey] invalid JSON', {
      at: new Date().toISOString(),
      method: req.method,
      query: queryForLog(req.nextUrl.searchParams),
      headers: maskSensitiveHeaders(req.headers),
      bodyPreview: rawText.slice(0, 4000),
    })
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  logFilloutWebhookIncoming(req, raw)

  let body: Record<string, unknown>
  if (Array.isArray(raw)) {
    if (raw.length === 1 && isRecord(raw[0])) {
      body = raw[0] as Record<string, unknown>
    } else {
      return NextResponse.json(
        {
          error: 'JSON body must be one object (or a single-element array of an object).',
          received: `array length ${raw.length}`,
        },
        { status: 400 },
      )
    }
  } else if (isRecord(raw)) {
    body = raw
  } else {
    return NextResponse.json(
      { error: 'JSON body must be a JSON object', receivedType: typeof raw },
      { status: 400 },
    )
  }

  const submission = extractSubmissionPayload(body)
  if (!isRecord(submission)) {
    const receivedTopLevelKeys = Object.keys(body)
    return NextResponse.json(
      {
        error:
          'Could not find a Fillout submission object (expected `submission` with `questions`, or equivalent).',
        receivedTopLevelKeys,
        hint:
          'In Fillout → Integrate → Webhook: if Advanced view customizes the POST body, reset to the default payload or include the standard `submission` + `questions` shape. Test webhooks from Fillout must still include that structure.',
      },
      { status: 400 },
    )
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
