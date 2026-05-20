import { revalidatePath } from 'next/cache'
import { scheduleLensSession } from '@/lib/zoho-lens'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import {
  formatLensScheduleLocalTime,
  formatUtcOffsetForZoho,
  resolveShopTimeZone,
} from '@/lib/expert-assist/lens-timezone'
import { sendConsultSms } from '@/lib/expert-assist/send-sms'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_ACTIVE_LENS_SESSIONS_PER_CASE = 3
const MEET_NOW_BUFFER_MS = 2 * 60 * 1000
const MEET_NOW_DURATION_MS = 45 * 60 * 1000
const DEFAULT_SCHEDULE_DURATION_MS = 30 * 60 * 1000

export type LensSessionRow = {
  id: string
  case_id: string
  mode: 'instant' | 'scheduled'
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  technician_url: string
  customer_join_url: string
  status: string
  created_at: string
}

async function loadOpenCase(caseId: string) {
  const { data, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, shop_id, originating_phone_number')
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Case not found')
  if ((data as { status: string }).status !== 'open') {
    throw new Error('Video sessions are only available on open consults')
  }
  return data as {
    id: string
    shop_id: string | null
    originating_phone_number: string
  }
}

async function countActiveLensSessions(caseId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('consult_lens_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caseId)
    .in('status', ['created', 'notified'])
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function resolveCustomerEmail(shopId: string | null): Promise<string> {
  if (!shopId) throw new Error('Case must be linked to a shop before scheduling video')
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('consult_billing_email, name, state')
    .eq('id', shopId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const email = (data as { consult_billing_email: string | null } | null)?.consult_billing_email?.trim()
  if (!email || !email.includes('@')) {
    throw new Error(
      'Shop billing email is required for Zoho Lens (used to generate the join link). Add it on the shop Expert Assist panel.'
    )
  }
  return email
}

async function loadShopState(shopId: string | null): Promise<string | null> {
  if (!shopId) return null
  const { data } = await supabaseAdmin.from('locations').select('state').eq('id', shopId).maybeSingle()
  return (data as { state: string | null } | null)?.state ?? null
}

async function insertLensSessionRow(params: {
  caseId: string
  mode: 'instant' | 'scheduled'
  scheduleId: string | null
  scheduledStartAt: string | null
  scheduledEndAt: string | null
  technicianUrl: string
  customerJoinUrl: string
  createdBy: string
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('consult_lens_sessions')
    .insert({
      case_id: params.caseId,
      zoho_schedule_id: params.scheduleId,
      mode: params.mode,
      scheduled_start_at: params.scheduledStartAt,
      scheduled_end_at: params.scheduledEndAt,
      technician_url: params.technicianUrl,
      customer_join_url: params.customerJoinUrl,
      status: 'created',
      created_by_user_id: params.createdBy,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to save Lens session')
  return (data as { id: string }).id
}

async function notifyShopSms(params: {
  caseId: string
  to: string
  body: string
  lensSessionId: string
}): Promise<void> {
  await sendConsultSms({
    to: params.to,
    body: params.body,
    caseId: params.caseId,
    logDirection: 'system',
  })
  await supabaseAdmin
    .from('consult_lens_sessions')
    .update({ status: 'notified' })
    .eq('id', params.lensSessionId)
}

async function insertSystemTranscriptLine(caseId: string, body: string): Promise<void> {
  await supabaseAdmin.from('consult_messages').insert({
    case_id: caseId,
    direction: 'system',
    body,
    media_urls: [],
    delivery_status: 'delivered',
  })
}

function revalidateConsult(caseId: string) {
  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)
}

export async function fetchConsultLensSessions(caseId: string): Promise<LensSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('consult_lens_sessions')
    .select(
      'id, case_id, mode, scheduled_start_at, scheduled_end_at, technician_url, customer_join_url, status, created_at'
    )
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as LensSessionRow[]
}

export type LensMeetNowResult = {
  lensSessionId: string
  technicianUrl: string
  scheduledStartAt: string
}

/** Meet now: near-immediate Zoho schedule so we get a customer join URL for SMS. */
export async function startLensMeetNow(caseId: string, expertEmail: string): Promise<LensMeetNowResult> {
  const c = await loadOpenCase(caseId)
  if ((await countActiveLensSessions(caseId)) >= MAX_ACTIVE_LENS_SESSIONS_PER_CASE) {
    throw new Error('This case already has the maximum number of active video sessions')
  }

  const customerEmail = await resolveCustomerEmail(c.shop_id)
  const state = await loadShopState(c.shop_id)
  const timeZone = resolveShopTimeZone(state)
  const startMs = Date.now() + MEET_NOW_BUFFER_MS
  const endMs = startMs + MEET_NOW_DURATION_MS
  const startDate = new Date(startMs)
  const utcOffset = formatUtcOffsetForZoho(startDate, timeZone)

  const scheduled = await scheduleLensSession({
    title: `Expert Assist ${caseId.slice(0, 8)}`,
    notes: 'RepairWise Expert Assist — meet now',
    customerEmail,
    scheduleStartMs: startMs,
    scheduleEndMs: endMs,
    utcOffset,
    timeZone,
    reminderMinutes: 0,
  })

  const scheduledStartAt = new Date(startMs).toISOString()
  const scheduledEndAt = new Date(endMs).toISOString()

  const lensSessionId = await insertLensSessionRow({
    caseId,
    mode: 'instant',
    scheduleId: scheduled.scheduleId,
    scheduledStartAt,
    scheduledEndAt,
    technicianUrl: scheduled.technicianUrl,
    customerJoinUrl: scheduled.customerUrl,
    createdBy: expertEmail,
  })

  const localWhen = formatLensScheduleLocalTime(scheduledStartAt, timeZone)
  const smsBody = `RepairWise Expert Assist: Your Tesla expert is ready for a live video session (${localWhen}). Join: ${scheduled.customerUrl}`

  await notifyShopSms({ caseId, to: c.originating_phone_number, body: smsBody, lensSessionId })

  await insertConsultCaseEvent({
    caseId,
    eventType: 'lens_session_created',
    actorType: 'expert',
    actorId: expertEmail,
    metadata: {
      lens_session_id: lensSessionId,
      mode: 'instant',
      zoho_schedule_id: scheduled.scheduleId,
    },
  })

  await insertSystemTranscriptLine(
    caseId,
    `Live video session started. Join link sent to shop via SMS (${localWhen}). Start the consult timer when they join.`
  )

  revalidateConsult(caseId)

  return {
    lensSessionId,
    technicianUrl: scheduled.technicianUrl,
    scheduledStartAt,
  }
}

export type LensScheduleResult = {
  lensSessionId: string
  technicianUrl: string
  scheduledStartAt: string
}

export async function scheduleLensConsultVideo(
  caseId: string,
  expertEmail: string,
  scheduledStartIso: string
): Promise<LensScheduleResult> {
  const c = await loadOpenCase(caseId)
  if ((await countActiveLensSessions(caseId)) >= MAX_ACTIVE_LENS_SESSIONS_PER_CASE) {
    throw new Error('This case already has the maximum number of active video sessions')
  }

  const startMs = new Date(scheduledStartIso).getTime()
  if (!Number.isFinite(startMs) || startMs < Date.now() - 60_000) {
    throw new Error('Scheduled time must be in the future')
  }

  const customerEmail = await resolveCustomerEmail(c.shop_id)
  const state = await loadShopState(c.shop_id)
  const timeZone = resolveShopTimeZone(state)
  const endMs = startMs + DEFAULT_SCHEDULE_DURATION_MS
  const startDate = new Date(startMs)
  const utcOffset = formatUtcOffsetForZoho(startDate, timeZone)

  const scheduled = await scheduleLensSession({
    title: `Expert Assist ${caseId.slice(0, 8)}`,
    notes: 'RepairWise Expert Assist — scheduled video',
    customerEmail,
    scheduleStartMs: startMs,
    scheduleEndMs: endMs,
    utcOffset,
    timeZone,
    reminderMinutes: 15,
  })

  const scheduledStartAt = new Date(startMs).toISOString()
  const scheduledEndAt = new Date(endMs).toISOString()
  const localWhen = formatLensScheduleLocalTime(scheduledStartAt, timeZone)

  const lensSessionId = await insertLensSessionRow({
    caseId,
    mode: 'scheduled',
    scheduleId: scheduled.scheduleId,
    scheduledStartAt,
    scheduledEndAt,
    technicianUrl: scheduled.technicianUrl,
    customerJoinUrl: scheduled.customerUrl,
    createdBy: expertEmail,
  })

  const smsBody = `RepairWise Expert Assist: Video call scheduled for ${localWhen}. Join: ${scheduled.customerUrl}`

  await notifyShopSms({ caseId, to: c.originating_phone_number, body: smsBody, lensSessionId })

  await insertConsultCaseEvent({
    caseId,
    eventType: 'lens_session_scheduled',
    actorType: 'expert',
    actorId: expertEmail,
    metadata: {
      lens_session_id: lensSessionId,
      scheduled_start_at: scheduledStartAt,
      zoho_schedule_id: scheduled.scheduleId,
    },
  })

  await insertSystemTranscriptLine(
    caseId,
    `Video call scheduled for ${localWhen}. Join link sent to shop via SMS.`
  )

  revalidateConsult(caseId)

  return {
    lensSessionId,
    technicianUrl: scheduled.technicianUrl,
    scheduledStartAt,
  }
}
