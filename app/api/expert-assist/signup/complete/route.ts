import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  CompleteExpertAssistSignupError,
  completeExpertAssistSignup,
} from '@/lib/expert-assist/complete-signup'
import { recordExpertAssistSignup } from '@/lib/activation/signup'
import { secureTokenEquals } from '@/lib/secure-token'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  return token || null
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

export async function POST(req: NextRequest) {
  const secret = process.env.EXPERT_ASSIST_SIGNUP_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Expert Assist signup is not configured' }, { status: 503 })
  }

  const token = bearerToken(req.headers.get('authorization'))
  if (!token || !secureTokenEquals(token, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const locationId = String(body.location_id ?? body.locationId ?? '').trim()
  const name = String(body.name ?? '').trim()
  const emailRaw = body.email
  const phoneRaw = body.phone
  const email =
    emailRaw === null || emailRaw === undefined ? null : String(emailRaw).trim() || null
  const phone =
    phoneRaw === null || phoneRaw === undefined ? null : String(phoneRaw).trim() || null
  const isOwner = parseBool(body.is_owner ?? body.isOwner)
  const skipCard = parseBool(body.skip_card ?? body.skipCard)
  const enroll = body.enroll === undefined ? true : parseBool(body.enroll)

  try {
    const result = await completeExpertAssistSignup(supabaseAdmin, {
      locationId,
      name,
      email,
      phone,
      isOwner,
      skipCard,
      enroll,
    })

    revalidatePath('/consults')
    revalidatePath(`/shops/${result.locationId}`)

    try {
      await recordExpertAssistSignup(supabaseAdmin, result.locationId, result.activationVariant)
    } catch (activationError) {
      console.error('expert-assist signup/complete: activation facts failed', activationError)
    }

    return NextResponse.json({
      ok: true,
      location_id: result.locationId,
      contact_id: result.contactId,
      approved_contact_id: result.approvedContactId,
      enrollment_id: result.enrollmentId,
      consult_enabled: result.consultEnabled,
      enrollment_created: result.enrollmentCreated,
      activation_variant: result.activationVariant,
    })
  } catch (error) {
    if (error instanceof CompleteExpertAssistSignupError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Signup completion failed'
    console.error('expert-assist signup/complete:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
