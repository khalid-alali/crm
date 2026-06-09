import { randomUUID } from 'crypto'
import { CONSULT_MEDIA_BUCKET, consultMediaObjectPath } from '@/lib/expert-assist/constants'
import { assertShopCanRunConsults } from '@/lib/expert-assist/billing-gates'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { notifyExpertAssistSlack } from '@/lib/expert-assist/slack'
import { decodeVinNhtsa, extractVinFromText } from '@/lib/expert-assist/vin-decode'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_FILES = 5
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'video/mp4'])

function extFromMime(ct: string): string {
  if (ct === 'image/jpeg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'video/mp4') return 'mp4'
  return 'bin'
}

export function buildQuestionBody(parts: {
  vehicle: string
  issue: string
  vin?: string
  mileage?: string
}): string {
  const lines = [`Vehicle: ${parts.vehicle.trim()}`]
  if (parts.vin?.trim()) lines.push(`VIN: ${parts.vin.trim()}`)
  if (parts.mileage?.trim()) lines.push(`Mileage: ${parts.mileage.trim()}`)
  lines.push(`Issue: ${parts.issue.trim()}`)
  return lines.join('\n')
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

export async function resolveOrCreateApprovedContact(
  shopId: string,
  phone: string,
): Promise<{ ok: true; contactId: string } | { ok: false; message: string; status: number }> {
  const { data: otherShop } = await supabaseAdmin
    .from('shop_approved_contacts')
    .select('shop_id')
    .eq('phone_number', phone)
    .eq('status', 'approved')
    .maybeSingle()

  if (otherShop && (otherShop as { shop_id: string }).shop_id !== shopId) {
    return {
      ok: false,
      message: 'This phone number is already registered for Expert Assist at another shop.',
      status: 409,
    }
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

export type CreateWebConsultInput = {
  shopId: string
  shopName: string
  phoneRaw: string
  vehicle: string
  issue: string
  vinOpt?: string
  mileageOpt?: string
  smsConsent: boolean
  files: File[]
  source?: string
}

export type CreateWebConsultResult =
  | { ok: true; caseId: string }
  | { ok: false; message: string; status: number }

export async function createWebConsultCase(input: CreateWebConsultInput): Promise<CreateWebConsultResult> {
  if (!input.smsConsent) {
    return { ok: false, message: 'SMS consent is required before we can text this number.', status: 400 }
  }

  const phone = normalizeSmsAddress(input.phoneRaw)
  if (!phone) return { ok: false, message: 'Enter a valid phone number.', status: 400 }
  if (!input.vehicle.trim() || !input.issue.trim()) {
    return { ok: false, message: 'Vehicle and issue are required.', status: 400 }
  }
  if (input.files.length > MAX_FILES) {
    return { ok: false, message: `At most ${MAX_FILES} files.`, status: 400 }
  }

  const gate = await assertShopCanRunConsults(input.shopId)
  if (!gate.ok) return { ok: false, message: gate.reason, status: 400 }

  const contact = await resolveOrCreateApprovedContact(input.shopId, phone)
  if (!contact.ok) return { ok: false, message: contact.message, status: contact.status }

  const questionBody = buildQuestionBody({
    vehicle: input.vehicle,
    issue: input.issue,
    vin: input.vinOpt,
    mileage: input.mileageOpt,
  })
  const vinFromFields =
    input.vinOpt?.length === 17 ?
      input.vinOpt.toUpperCase()
    : extractVinFromText(`${questionBody}\n${input.vehicle}`)
  const decoded = vinFromFields ? await decodeVinNhtsa(vinFromFields) : null

  try {
    const { data: newCase, error: cErr } = await supabaseAdmin
      .from('consult_cases')
      .insert({
        shop_id: input.shopId,
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
      return { ok: false, message: cErr?.message ?? 'Case create failed', status: 400 }
    }

    const caseId = (newCase as { id: string }).id
    const source = input.source ?? 'web_intake'
    await insertConsultCaseEvent({
      caseId,
      eventType: 'created',
      actorType: 'shop',
      metadata: { from: phone, source, sms_consent: true },
    })

    let mediaPaths: string[] = []
    if (input.files.length) mediaPaths = await uploadIntakeFiles(caseId, input.files)
    await insertInboundWebMessage({
      caseId,
      body: questionBody,
      mediaPaths,
      from: phone,
    })

    await notifyExpertAssistSlack({
      type: 'open',
      caseId,
      shopName: input.shopName,
      source,
    })

    return { ok: true, caseId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return { ok: false, message: msg, status: 400 }
  }
}
