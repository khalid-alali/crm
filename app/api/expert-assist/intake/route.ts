import { timingSafeEqual } from 'crypto'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

import { CONSULT_MEDIA_BUCKET, consultMediaObjectPath } from '@/lib/expert-assist/constants'
import { assertShopCanRunConsults } from '@/lib/expert-assist/billing-gates'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { openCaseWithRecentActivity } from '@/lib/expert-assist/inbound-sms'
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { postExpertAssistSlack } from '@/lib/expert-assist/slack'
import { decodeVinNhtsa, extractVinFromText } from '@/lib/expert-assist/vin-decode'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_FILES = 5
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'video/mp4'])

function timingSafeSecretEqual(secret: string, header: string | null): boolean {
  const expected = secret.trim()
  if (!expected || !header?.startsWith('Bearer ')) return false
  const token = header.slice(7).trim()
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(token, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const raw = process.env.EXPERT_ASSIST_INTAKE_ALLOWED_ORIGINS?.trim()
  const allowed = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  if (!allowed.length) return {}
  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
  }
  return {}
}

function withCors(origin: string | null, res: NextResponse): NextResponse {
  const h = corsHeaders(origin)
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v)
  return res
}

async function insertInboundWebMessage(params: {
  caseId: string
  body: string | null
  mediaPaths: string[]
  from: string
}) {
  const { error } = await supabaseAdmin.from('consult_messages').insert({
    case_id: params.caseId,
    direction: 'inbound',
    body: params.body,
    media_urls: params.mediaPaths,
    from_number: params.from,
    to_number: null,
    twilio_message_sid: null,
    delivery_status: 'delivered',
  })
  if (error) throw new Error(error.message)
}

function extFromMime(ct: string): string {
  if (ct === 'image/jpeg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'video/mp4') return 'mp4'
  return 'bin'
}

async function uploadIntakeFiles(caseId: string, files: File[]): Promise<string[]> {
  const paths: string[] = []
  for (const file of files) {
    const ct = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME.has(ct)) {
      throw new Error(`Unsupported file type: ${ct}. Use JPG, PNG, or MP4.`)
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`Each file must be at most ${MAX_FILE_BYTES / (1024 * 1024)}MB.`)
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const objectPath = consultMediaObjectPath(caseId, `${randomUUID()}.${extFromMime(ct)}`)
    const { error } = await supabaseAdmin.storage.from(CONSULT_MEDIA_BUCKET).upload(objectPath, buf, {
      contentType: ct,
      upsert: false,
    })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    paths.push(objectPath)
  }
  return paths
}

async function resolveOrCreateApprovedContact(
  shopId: string,
  phone: string
): Promise<{ ok: true; contactId: string } | { ok: false; message: string; status: number }> {
  const { data: otherShop } = await supabaseAdmin
    .from('shop_approved_contacts')
    .select('shop_id')
    .eq('phone_number', phone)
    .eq('status', 'approved')
    .maybeSingle()

  if (otherShop && (otherShop as { shop_id: string }).shop_id !== shopId) {
    return { ok: false, message: 'This phone number is already registered for Expert Assist at another shop.', status: 409 }
  }

  const { data: mine } = await supabaseAdmin
    .from('shop_approved_contacts')
    .select('id, status')
    .eq('shop_id', shopId)
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()
  const row = mine as { id: string; status: string } | null

  if (row?.status === 'approved') return { ok: true, contactId: row.id }

  if (row?.status === 'pending') {
    const { error } = await supabaseAdmin
      .from('shop_approved_contacts')
      .update({
        status: 'approved',
        approved_at: now,
        approved_by_user_id: 'web_intake',
      })
      .eq('id', row.id)
    if (error) return { ok: false, message: error.message, status: 400 }
    return { ok: true, contactId: row.id }
  }

  if (row?.status === 'revoked') {
    const { error } = await supabaseAdmin
      .from('shop_approved_contacts')
      .update({
        status: 'approved',
        approved_at: now,
        approved_by_user_id: 'web_intake',
        revoked_at: null,
        revoked_by_user_id: null,
      })
      .eq('id', row.id)
    if (error) return { ok: false, message: error.message, status: 400 }
    return { ok: true, contactId: row.id }
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('shop_approved_contacts')
    .insert({
      shop_id: shopId,
      phone_number: phone,
      display_name: null,
      status: 'approved',
      added_via: 'owner_added',
      approved_at: now,
      approved_by_user_id: 'web_intake',
    })
    .select('id')
    .single()

  if (insErr || !inserted) return { ok: false, message: insErr?.message ?? 'Contact insert failed', status: 400 }
  return { ok: true, contactId: (inserted as { id: string }).id }
}

function buildQuestionBody(parts: { vehicle: string; issue: string; vin?: string; mileage?: string }): string {
  const lines = [`Vehicle: ${parts.vehicle.trim()}`]
  if (parts.vin?.trim()) lines.push(`VIN: ${parts.vin.trim()}`)
  if (parts.mileage?.trim()) lines.push(`Mileage: ${parts.mileage.trim()}`)
  lines.push(`Issue: ${parts.issue.trim()}`)
  return lines.join('\n')
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req.headers.get('origin'), new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const secret = process.env.EXPERT_ASSIST_INTAKE_SECRET?.trim()
  if (!secret) {
    return withCors(origin, NextResponse.json({ error: 'Intake is not configured' }, { status: 503 }))
  }
  if (!timingSafeSecretEqual(secret, req.headers.get('authorization'))) {
    return withCors(origin, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  let locationId: string
  let phoneRaw: string
  let vehicle: string
  let issue: string
  let vinOpt: string | undefined
  let mileageOpt: string | undefined
  let smsConsent: boolean
  const files: File[] = []

  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    locationId = String(form.get('location_id') ?? '').trim()
    phoneRaw = String(form.get('phone') ?? '')
    vehicle = String(form.get('vehicle') ?? '').trim()
    issue = String(form.get('issue') ?? '').trim()
    const vin = form.get('vin')
    const mileage = form.get('mileage')
    vinOpt = vin ? String(vin).trim() : undefined
    mileageOpt = mileage ? String(mileage).trim() : undefined
    const consent = form.get('sms_consent')
    smsConsent = consent === 'true' || consent === 'on' || consent === '1'
    for (const v of form.values()) {
      if (v instanceof File && v.size > 0) files.push(v)
    }
  } else {
    const body = (await req.json()) as Record<string, unknown>
    locationId = String(body.location_id ?? '').trim()
    phoneRaw = String(body.phone ?? '')
    vehicle = String(body.vehicle ?? '').trim()
    issue = String(body.issue ?? '').trim()
    vinOpt = body.vin ? String(body.vin).trim() : undefined
    mileageOpt = body.mileage ? String(body.mileage).trim() : undefined
    smsConsent = body.sms_consent === true
  }

  if (!smsConsent) {
    return withCors(
      origin,
      NextResponse.json({ error: 'SMS consent is required before we can text this number.' }, { status: 400 })
    )
  }

  const phone = normalizeSmsAddress(phoneRaw)
  if (!phone) {
    return withCors(origin, NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 }))
  }
  if (!locationId || !vehicle || !issue) {
    return withCors(
      origin,
      NextResponse.json({ error: 'location_id, vehicle, issue, and phone are required.' }, { status: 400 })
    )
  }

  if (files.length > MAX_FILES) {
    return withCors(origin, NextResponse.json({ error: `At most ${MAX_FILES} files.` }, { status: 400 }))
  }

  const gate = await assertShopCanRunConsults(locationId)
  if (!gate.ok) {
    return withCors(origin, NextResponse.json({ error: gate.reason }, { status: 400 }))
  }

  const contact = await resolveOrCreateApprovedContact(locationId, phone)
  if (!contact.ok) {
    return withCors(origin, NextResponse.json({ error: contact.message }, { status: contact.status }))
  }

  const questionBody = buildQuestionBody({ vehicle, issue, vin: vinOpt, mileage: mileageOpt })
  const vinFromFields = vinOpt?.length === 17 ? vinOpt.toUpperCase() : extractVinFromText(`${questionBody}\n${vehicle}`)
  const decoded = vinFromFields ? await decodeVinNhtsa(vinFromFields) : null

  try {
    const appendId = await openCaseWithRecentActivity(contact.contactId)
    if (appendId) {
      let mediaPaths: string[] = []
      if (files.length) mediaPaths = await uploadIntakeFiles(appendId, files)
      await insertInboundWebMessage({
        caseId: appendId,
        body: questionBody,
        mediaPaths,
        from: phone,
      })
      const { data: existingCase } = await supabaseAdmin
        .from('consult_cases')
        .select('vin')
        .eq('id', appendId)
        .maybeSingle()
      const hasVin = Boolean((existingCase as { vin: string | null } | null)?.vin)
      if (!hasVin && vinFromFields) {
        await supabaseAdmin
          .from('consult_cases')
          .update({
            vin: vinFromFields,
            year: decoded?.year ?? null,
            model: decoded?.model ?? null,
            trim: decoded?.trim ?? null,
          })
          .eq('id', appendId)
      }
      await insertConsultCaseEvent({
        caseId: appendId,
        eventType: 'note_added',
        actorType: 'shop',
        metadata: { source: 'web_intake', sms_consent: true },
      })
      return withCors(origin, NextResponse.json({ ok: true, case_id: appendId, appended: true }))
    }

    const { data: newCase, error: cErr } = await supabaseAdmin
      .from('consult_cases')
      .insert({
        shop_id: locationId,
        originating_phone_number: phone,
        originating_contact_id: contact.contactId,
        status: 'open',
        initial_question: questionBody,
        vin: vinFromFields ?? null,
        year: decoded?.year ?? null,
        model: decoded?.model ?? null,
        trim: decoded?.trim ?? null,
      })
      .select('id')
      .single()

    if (cErr || !newCase) {
      return withCors(origin, NextResponse.json({ error: cErr?.message ?? 'Case create failed' }, { status: 400 }))
    }

    const caseId = (newCase as { id: string }).id
    await insertConsultCaseEvent({
      caseId,
      eventType: 'created',
      actorType: 'shop',
      metadata: { from: phone, source: 'web_intake', sms_consent: true },
    })

    let mediaPaths: string[] = []
    if (files.length) mediaPaths = await uploadIntakeFiles(caseId, files)
    await insertInboundWebMessage({
      caseId,
      body: questionBody,
      mediaPaths,
      from: phone,
    })

    const { data: shop } = await supabaseAdmin.from('locations').select('name').eq('id', locationId).maybeSingle()
    await postExpertAssistSlack(
      `Expert Assist: OPEN case ${caseId} (web intake) — shop **${(shop as { name: string } | null)?.name ?? locationId}**`
    )

    return withCors(origin, NextResponse.json({ ok: true, case_id: caseId, appended: false }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return withCors(origin, NextResponse.json({ error: msg }, { status: 400 }))
  }
}
