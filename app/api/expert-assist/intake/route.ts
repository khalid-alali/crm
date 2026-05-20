import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createWebConsultCase } from '@/lib/expert-assist/web-consult'
import { supabaseAdmin } from '@/lib/supabase'

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

  if (!locationId) {
    return withCors(
      origin,
      NextResponse.json({ error: 'location_id, vehicle, issue, and phone are required.' }, { status: 400 }),
    )
  }

  const { data: shop } = await supabaseAdmin.from('locations').select('name').eq('id', locationId).maybeSingle()
  const shopName = (shop as { name: string } | null)?.name ?? locationId

  const result = await createWebConsultCase({
    shopId: locationId,
    shopName,
    phoneRaw,
    vehicle,
    issue,
    vinOpt,
    mileageOpt,
    smsConsent,
    files,
    source: 'web_intake',
  })

  if (!result.ok) {
    return withCors(origin, NextResponse.json({ error: result.message }, { status: result.status }))
  }

  return withCors(origin, NextResponse.json({ ok: true, case_id: result.caseId, appended: false }))
}
