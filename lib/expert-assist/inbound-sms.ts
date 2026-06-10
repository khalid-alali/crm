import type { InboundSmsTriggerPayload } from '@/lib/activation/types'
import { recomputeStage, setFirstInboundIfNull } from '@/lib/activation/bindings'
import { triggerInboundSms } from '@/lib/activation/trigger'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { hasInboundMedia } from '@/lib/expert-assist/consult-media'
import { shopAllowsInboundConsultSms } from '@/lib/expert-assist/billing-gates'
import { decodeVinNhtsa, extractVinFromText } from '@/lib/expert-assist/vin-decode'
import { normalizeShopShortCode, normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { downloadTwilioMediaToConsultStorage } from '@/lib/expert-assist/storage'
import { sendConsultSms, sendTwilioSmsWithoutLog } from '@/lib/expert-assist/send-sms'
import { notifyExpertAssistSlack } from '@/lib/expert-assist/slack'
import { supabaseAdmin } from '@/lib/supabase'

const WELCOME_CLAIM =
  process.env.EXPERT_ASSIST_COPY_WELCOME?.trim() ||
  "Welcome to Expert Assist. To get help, reply with your shop's code (e.g., WESTSIDE). If you don't have one, reply HELP."

function helpReplyBody(): string {
  return (
    process.env.EXPERT_ASSIST_HELP_TEXT?.trim() ||
    'Need help? Contact your Fixlane representative or email your shop success contact for your shop code.'
  )
}

function formToRecord(form: FormData | URLSearchParams): Record<string, string> {
  const o: Record<string, string> = {}
  if (form instanceof FormData) {
    form.forEach((v, k) => {
      if (typeof v === 'string') o[k] = v
    })
  } else {
    form.forEach((v, k) => {
      o[k] = v
    })
  }
  return o
}

export function twilioParamsFromFormData(form: FormData): Record<string, string> {
  return formToRecord(form)
}

async function inboundSidExists(messageSid: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('consult_messages')
    .select('id')
    .eq('twilio_message_sid', messageSid)
    .maybeSingle()
  return Boolean(data)
}

async function findApprovedContactForPhone(phone: string) {
  const { data } = await supabaseAdmin
    .from('shop_approved_contacts')
    .select('id, shop_id, status, display_name')
    .eq('phone_number', phone)
    .eq('status', 'approved')
    .maybeSingle()
  return data as { id: string; shop_id: string; status: string; display_name: string | null } | null
}

async function findAwaitingApprovalCase(phone: string) {
  const { data } = await supabaseAdmin
    .from('consult_cases')
    .select('id')
    .eq('status', 'awaiting_expert_approval')
    .eq('originating_phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string } | null
}

async function findAwaitingShopCodeCase(phone: string) {
  const { data } = await supabaseAdmin
    .from('consult_cases')
    .select('id, initial_question')
    .eq('status', 'awaiting_shop_code')
    .eq('originating_phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string; initial_question: string | null } | null
}

async function findLocationByShortCode(code: string) {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('id, name')
    .eq('consult_short_code', code)
    .maybeSingle()
  return data as { id: string; name: string } | null
}

export async function openCaseWithRecentActivity(contactId: string): Promise<string | null> {
  const { data: cases } = await supabaseAdmin
    .from('consult_cases')
    .select('id')
    .eq('status', 'open')
    .eq('originating_contact_id', contactId)
    .order('created_at', { ascending: false })

  const list = cases as { id: string }[] | null
  if (!list?.length) return null

  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const c of list) {
    const { data: last } = await supabaseAdmin
      .from('consult_messages')
      .select('created_at')
      .eq('case_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ts = last?.created_at ? new Date(last.created_at as string).getTime() : 0
    if (ts >= cutoff) return c.id
  }
  return null
}

async function collectMediaPaths(caseId: string, form: Record<string, string>): Promise<string[]> {
  const num = Number.parseInt(form['NumMedia'] ?? '0', 10) || 0
  const paths: string[] = []
  for (let i = 0; i < num; i++) {
    const url = form[`MediaUrl${i}`]?.trim()
    const ct = form[`MediaContentType${i}`] ?? null
    if (!url) continue
    const p = await downloadTwilioMediaToConsultStorage({ caseId, twilioMediaUrl: url, contentType: ct })
    if (p) paths.push(p)
  }
  return paths
}

async function insertInboundMessage(params: {
  caseId: string
  body: string | null
  mediaPaths: string[]
  from: string
  to: string
  twilioMessageSid: string | undefined
}) {
  const { error } = await supabaseAdmin.from('consult_messages').insert({
    case_id: params.caseId,
    direction: 'inbound',
    body: params.body,
    media_urls: params.mediaPaths,
    from_number: params.from,
    to_number: params.to,
    twilio_message_sid: params.twilioMessageSid ?? null,
    delivery_status: 'delivered',
  })
  if (error) throw new Error(error.message)
}

async function maybeApplyVinFromBody(caseId: string, body: string, currentVin: string | null) {
  if (currentVin) return
  const vin = extractVinFromText(body)
  if (!vin) return
  const decoded = await decodeVinNhtsa(vin)
  await supabaseAdmin
    .from('consult_cases')
    .update({
      vin,
      year: decoded?.year ?? null,
      model: decoded?.model ?? null,
      trim: decoded?.trim ?? null,
    })
    .eq('id', caseId)
}

/** Dev fallback when Trigger.dev is not configured — mirrors inbound-sms task side effects. */
export async function processInboundSmsAfterPersist(payload: InboundSmsTriggerPayload): Promise<void> {
  const now = new Date().toISOString()
  await setFirstInboundIfNull(payload.locationId, now)
  await recomputeStage(payload.locationId)

  if (payload.notifyOpen && payload.caseId) {
    await notifyExpertAssistSlack({
      type: 'open',
      caseId: payload.caseId,
      shopName: payload.shopName ?? payload.locationId,
      source: 'sms',
    })
  }
}

async function persistApprovedInboundAndTrigger(
  form: Record<string, string>,
  approved: { id: string; shop_id: string },
  from: string,
  to: string,
  body: string,
  messageSid: string | undefined,
): Promise<void> {
  if (hasInboundMedia(form)) {
    const dedupe = messageSid?.trim() || crypto.randomUUID()
    try {
      const { recordPrintoutPhotoReceived } = await import('@/lib/activation/ingest')
      await recordPrintoutPhotoReceived(approved.shop_id, dedupe)
    } catch (err) {
      console.error('printout photo ingest', err)
    }
  }

  let caseId: string
  let notifyOpen = false

  const appendId = await openCaseWithRecentActivity(approved.id)
  if (appendId) {
    caseId = appendId
    const paths = await collectMediaPaths(appendId, form)
    await insertInboundMessage({
      caseId: appendId,
      body: body || null,
      mediaPaths: paths,
      from,
      to,
      twilioMessageSid: messageSid,
    })
    const { data: c } = await supabaseAdmin
      .from('consult_cases')
      .select('vin')
      .eq('id', appendId)
      .maybeSingle()
    await maybeApplyVinFromBody(appendId, body, (c as { vin: string | null } | null)?.vin ?? null)
  } else {
    const vin = extractVinFromText(body)
    const decoded = vin ? await decodeVinNhtsa(vin) : null
    const { data: newCase, error: cErr } = await supabaseAdmin
      .from('consult_cases')
      .insert({
        shop_id: approved.shop_id,
        originating_phone_number: from,
        originating_contact_id: approved.id,
        status: 'open',
        initial_question: body || null,
        vin: vin ?? null,
        year: decoded?.year ?? null,
        model: decoded?.model ?? null,
        trim: decoded?.trim ?? null,
      })
      .select('id')
      .single()

    if (cErr || !newCase) throw new Error(cErr?.message ?? 'case insert failed')
    caseId = newCase.id as string
    notifyOpen = true
    await insertConsultCaseEvent({ caseId, eventType: 'created', actorType: 'shop', metadata: { from } })
    const paths = await collectMediaPaths(caseId, form)
    await insertInboundMessage({
      caseId,
      body: body || null,
      mediaPaths: paths,
      from,
      to,
      twilioMessageSid: messageSid,
    })
  }

  const { data: shop } = await supabaseAdmin
    .from('locations')
    .select('name')
    .eq('id', approved.shop_id)
    .maybeSingle()

  const messageId = messageSid?.trim() || crypto.randomUUID()
  await triggerInboundSms({
    locationId: approved.shop_id,
    messageId,
    caseId,
    body: body || null,
    fromPhone: from,
    shopName: (shop as { name: string } | null)?.name ?? approved.shop_id,
    notifyOpen,
  })
}

export async function handleInboundSms(form: Record<string, string>): Promise<void> {
  const rawFrom = form['From'] ?? ''
  const rawTo = form['To'] ?? ''
  const body = (form['Body'] ?? '').trim()
  const messageSid = form['MessageSid']?.trim()

  if (messageSid && (await inboundSidExists(messageSid))) return

  const from = normalizeSmsAddress(rawFrom)
  const to = normalizeSmsAddress(rawTo)
  if (!from) return

  const approved = await findApprovedContactForPhone(from)

  if (approved) {
    const allows = await shopAllowsInboundConsultSms(approved.shop_id)
    if (!allows) {
      await sendTwilioSmsWithoutLog(
        from,
        "Expert Assist isn't currently active for your shop. Contact your shop owner."
      )
      return
    }

    await persistApprovedInboundAndTrigger(form, approved, from, to, body, messageSid)
    return
  }

  const pendingApprovalCase = await findAwaitingApprovalCase(from)
  if (pendingApprovalCase && (body || hasInboundMedia(form))) {
    const paths = await collectMediaPaths(pendingApprovalCase.id, form)
    await insertInboundMessage({
      caseId: pendingApprovalCase.id,
      body: body || null,
      mediaPaths: paths,
      from,
      to,
      twilioMessageSid: messageSid,
    })
    return
  }

  const codeCase = await findAwaitingShopCodeCase(from)
  if (codeCase) {
    const upper = body.toUpperCase()
    if (upper === 'HELP') {
      await sendTwilioSmsWithoutLog(from, helpReplyBody())
      return
    }

    const codeRaw = normalizeShopShortCode(body)
    if (!codeRaw) {
      if (body.trim()) {
        await sendTwilioSmsWithoutLog(
          from,
          "We couldn't find that shop code. Double-check with your shop owner, or reply HELP for support."
        )
      }
      return
    }

    const loc = await findLocationByShortCode(codeRaw)
    if (!loc || !(await shopAllowsInboundConsultSms(loc.id))) {
      await sendTwilioSmsWithoutLog(
        from,
        "We couldn't find that shop code. Double-check with your shop owner, or reply HELP for support."
      )
      return
    }

    const { data: contact, error: pErr } = await supabaseAdmin
      .from('shop_approved_contacts')
      .insert({
        shop_id: loc.id,
        phone_number: from,
        status: 'pending',
        added_via: 'self_claimed',
        claimed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (pErr || !contact) {
      console.error('pending contact insert', pErr?.message)
      await sendTwilioSmsWithoutLog(
        from,
        'We could not verify your number right now. Please try again or contact support.'
      )
      return
    }

    const contactId = contact.id as string

    const { error: uErr } = await supabaseAdmin
      .from('consult_cases')
      .update({
        shop_id: loc.id,
        originating_contact_id: contactId,
        status: 'awaiting_expert_approval',
      })
      .eq('id', codeCase.id)

    if (uErr) throw new Error(uErr.message)

    await insertConsultCaseEvent({
      caseId: codeCase.id,
      eventType: 'shop_linked',
      actorType: 'system',
      metadata: { shop_id: loc.id, short_code: codeRaw },
    })
    await insertConsultCaseEvent({
      caseId: codeCase.id,
      eventType: 'contact_pending',
      actorType: 'shop',
      metadata: { contact_id: contactId },
    })

    const paths = await collectMediaPaths(codeCase.id, form)
    if (body) {
      await insertInboundMessage({
        caseId: codeCase.id,
        body,
        mediaPaths: paths,
        from,
        to,
        twilioMessageSid: messageSid,
      })
    } else if (paths.length) {
      await insertInboundMessage({
        caseId: codeCase.id,
        body: null,
        mediaPaths: paths,
        from,
        to,
        twilioMessageSid: messageSid,
      })
    }

    await sendConsultSms({
      to: from,
      body: `Got it — you're with ${loc.name}. We're verifying your number with your shop. An expert will reach out shortly.`,
      caseId: codeCase.id,
      logDirection: 'system',
      fromNumber: to,
    })

    await notifyExpertAssistSlack({
      type: 'awaiting_approval',
      caseId: codeCase.id,
      shopName: loc.name,
    })
    return
  }

  const { data: freshCase, error: nErr } = await supabaseAdmin
    .from('consult_cases')
    .insert({
      shop_id: null,
      originating_phone_number: from,
      originating_contact_id: null,
      status: 'awaiting_shop_code',
      initial_question: body || null,
    })
    .select('id')
    .single()

  if (nErr || !freshCase) throw new Error(nErr?.message ?? 'new case failed')
  const caseId = freshCase.id as string
  await insertConsultCaseEvent({ caseId, eventType: 'created', actorType: 'shop', metadata: { from, flow: 'claim' } })

  const paths = await collectMediaPaths(caseId, form)
  await insertInboundMessage({
    caseId,
    body: body || null,
    mediaPaths: paths,
    from,
    to,
    twilioMessageSid: messageSid,
  })

  await sendConsultSms({
    to: from,
    body: WELCOME_CLAIM,
    caseId,
    logDirection: 'system',
    fromNumber: to,
  })
}
