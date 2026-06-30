/**
 * One-time historical import of Dialpad calls into shop_call_activity.
 * Lists concluded calls per technicians-department member, then optionally
 * fetches AI recaps (rate-limited).
 */
import { supabaseAdmin } from '@/lib/supabase'
import { listDepartmentUsers, listCalls, getCallAiRecap, type DialpadCallRecord } from '@/lib/dialpad-api'
import { parseCallEvent, upsertShopCallHangup, upsertShopCallRecap, isCrmVisibleCall } from '@/lib/dialpad'

/** Dialpad ai_recap is capped at 12/min — stay under that. */
const RECAP_DELAY_MS = 5_200

export type DialpadBackfillOptions = {
  apply: boolean
  days: number
  skipRecaps: boolean
  /** Re-fetch recaps even when a summary already exists. */
  forceRecaps: boolean
}

export type DialpadBackfillSummary = {
  apply: boolean
  days: number
  startedAfter: string
  memberCount: number
  callsFound: number
  callsUpserted: number
  recapsFetched: number
  recapsWritten: number
  recapsUnavailable: number
  skippedExistingRecaps: number
  errors: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function hangupEventFromRecord(record: DialpadCallRecord) {
  return parseCallEvent({ state: 'hangup', call: record as Record<string, unknown> })
}

async function existingSummaries(callIds: number[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>()
  if (callIds.length === 0) return out

  const chunkSize = 500
  for (let i = 0; i < callIds.length; i += chunkSize) {
    const chunk = callIds.slice(i, i + chunkSize)
    const { data, error } = await supabaseAdmin
      .from('shop_call_activity')
      .select('call_id, summary')
      .in('call_id', chunk)
    if (error) throw error
    for (const row of data ?? []) {
      out.set(row.call_id as number, (row.summary as string | null) ?? null)
    }
  }
  return out
}

export async function runDialpadCallBackfill(opts: DialpadBackfillOptions): Promise<DialpadBackfillSummary> {
  const departmentId = process.env.DIALPAD_TECHNICIANS_DEPARTMENT_ID
  if (!departmentId) throw new Error('DIALPAD_TECHNICIANS_DEPARTMENT_ID is not set')

  const startedAfterMs = Date.now() - opts.days * 24 * 60 * 60 * 1000
  const summary: DialpadBackfillSummary = {
    apply: opts.apply,
    days: opts.days,
    startedAfter: new Date(startedAfterMs).toISOString(),
    memberCount: 0,
    callsFound: 0,
    callsUpserted: 0,
    recapsFetched: 0,
    recapsWritten: 0,
    recapsUnavailable: 0,
    skippedExistingRecaps: 0,
    errors: [],
  }

  const members = await listDepartmentUsers(departmentId)
  summary.memberCount = members.length

  const byCallId = new Map<string, ReturnType<typeof hangupEventFromRecord>>()
  for (const member of members) {
    try {
      const records = await listCalls({
        targetId: member.id,
        startedAfter: startedAfterMs,
      })
      for (const record of records) {
        const event = hangupEventFromRecord(record)
        if (!event.callId) continue
        if (!byCallId.has(event.callId)) byCallId.set(event.callId, event)
      }
    } catch (e) {
      summary.errors.push(`list ${member.id} (${member.name ?? 'unknown'}): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  summary.callsFound = byCallId.size
  const events = [...byCallId.values()]

  if (opts.apply) {
    for (const event of events) {
      if (!isCrmVisibleCall(event)) continue
      try {
        const persisted = await upsertShopCallHangup(event)
        if (persisted) summary.callsUpserted++
      } catch (e) {
        summary.errors.push(`upsert ${event.callId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  if (opts.skipRecaps) return summary

  const callIds = events.map(e => Number(e.callId)).filter(Number.isFinite)
  const summaries = opts.apply ? await existingSummaries(callIds) : new Map<number, string | null>()

  for (const event of events) {
    const callId = event.callId!
    const callIdNum = Number(callId)
    if (!isCrmVisibleCall(event)) continue
    const existing = summaries.get(callIdNum)
    if (existing && !opts.forceRecaps) {
      summary.skippedExistingRecaps++
      continue
    }

    if (!opts.apply) {
      summary.recapsFetched++
      continue
    }

    try {
      const recap = await getCallAiRecap(callId)
      summary.recapsFetched++
      if (recap) {
        await upsertShopCallRecap(callId, recap)
        summary.recapsWritten++
      } else {
        summary.recapsUnavailable++
      }
    } catch (e) {
      summary.errors.push(`recap ${callId}: ${e instanceof Error ? e.message : String(e)}`)
    }
    await sleep(RECAP_DELAY_MS)
  }

  return summary
}
