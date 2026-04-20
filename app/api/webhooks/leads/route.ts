import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
import { secureTokenEquals } from '@/lib/secure-token'

type LeadPayload = {
  shop_name?: unknown
  contact_name?: unknown
  email?: unknown
  phone?: unknown
  zip_code?: unknown
}

function getBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) return ''
  const [scheme, token] = authorizationHeader.split(/\s+/, 2)
  if (!scheme || !token) return ''
  return scheme.toLowerCase() === 'bearer' ? token.trim() : ''
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

function tokenFromRequest(req: NextRequest): string {
  const fromBearer = getBearerToken(req.headers.get('authorization'))
  if (fromBearer) return fromBearer
  const fromHeader = req.headers.get('x-lead-api-key')
  if (fromHeader?.trim()) return fromHeader.trim()
  const fromQuery = req.nextUrl.searchParams.get('token')
  return fromQuery?.trim() ?? ''
}

function isAuthorizedRequest(req: NextRequest): boolean {
  const expectedToken = process.env.LEAD_INTAKE_API_KEY?.trim() ?? ''
  if (!expectedToken) return false
  const providedToken = tokenFromRequest(req)
  if (!providedToken) return false
  return secureTokenEquals(providedToken, expectedToken)
}

export async function POST(req: NextRequest) {
  const configuredToken = process.env.LEAD_INTAKE_API_KEY?.trim() ?? ''
  if (!configuredToken) {
    return NextResponse.json(
      { error: 'Server misconfigured: LEAD_INTAKE_API_KEY is missing.' },
      { status: 500 },
    )
  }

  if (!isAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as LeadPayload
  const shopName = normalizeString(body.shop_name)
  const contactName = normalizeString(body.contact_name)
  const email = normalizeString(body.email).toLowerCase()
  const phone = normalizeString(body.phone)
  const zipCode = normalizePostalCode(body.zip_code)

  if (!shopName) {
    return NextResponse.json({ error: 'shop_name is required' }, { status: 400 })
  }
  if (!contactName) {
    return NextResponse.json({ error: 'contact_name is required' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'email is invalid' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: 'phone is invalid' }, { status: 400 })
  }
  if (!zipCode) {
    return NextResponse.json({ error: 'zip_code is required' }, { status: 400 })
  }

  const zipError = getPostalCodeError(zipCode)
  if (zipError) {
    return NextResponse.json({ error: zipError }, { status: 400 })
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from('accounts')
    .insert({
      business_name: shopName,
      notes: 'Auto-created from lead intake endpoint',
    })
    .select('id, business_name, created_at')
    .single()
  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 })
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from('locations')
    .insert({
      name: shopName,
      account_id: account.id,
      chain_name: detectChain(shopName),
      postal_code: zipCode,
      status: 'lead',
      source: 'lead_api',
    })
    .select('id, name, account_id, postal_code, status, source, created_at')
    .single()
  if (locationError) {
    return NextResponse.json({ error: locationError.message }, { status: 500 })
  }

  const { data: contact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .insert({
      account_id: account.id,
      location_id: location.id,
      name: contactName,
      email,
      phone,
      role: 'owner',
      is_primary: true,
      notes: 'Auto-created from lead intake endpoint',
    })
    .select('id, name, email, phone, role, is_primary, created_at')
    .single()
  if (contactError) {
    return NextResponse.json({ error: contactError.message }, { status: 500 })
  }

  const { error: activityError } = await supabaseAdmin.from('activity_log').insert({
    location_id: location.id,
    type: 'shop_created',
    subject: 'Lead received via API',
    body: 'Lead intake endpoint created account, shop, and contact.',
    sent_by: 'system',
  })
  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      ok: true,
      account,
      location,
      contact,
    },
    { status: 201 },
  )
}
