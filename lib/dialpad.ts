/**
 * Dialpad call-events ingestion. The call-events webhook delivers two states we
 * care about: `hangup` (all metadata, no summary) and `recap_summary` (the AI
 * recap, populated on a separate later event after post-call processing). Events
 * can arrive out of order, so the write path is upsert-on-call_id and either
 * event may land first. See dialpad-call-sync-spec.md.
 */
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase'
import { activeLocations } from '@/lib/locations-active'
import { phoneMatchKey } from '@/lib/phone'

/** Calls shorter than this (connected duration) don't enter the active queue. */
export const QUEUE_DURATION_FLOOR_SEC = 30

/**
 * Dialpad signs webhook payloads as an HS256 JWT using the webhook's `secret`.
 * Verify the signature and return the decoded event payload, or null if the
 * secret is unset or the token is invalid/forged (caller should reject with 401).
 */
export function verifyAndDecodeWebhook(rawBody: string): Record<string, unknown> | null {
  const secret = process.env.DIALPAD_WEBHOOK_SECRET
  if (!secret) {
    console.error('[dialpad webhook] DIALPAD_WEBHOOK_SECRET is not set')
    return null
  }
  try {
    const decoded = jwt.verify(rawBody.trim(), secret, { algorithms: ['HS256'] })
    return typeof decoded === 'object' && decoded !== null ? (decoded as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** unix-ms (number or numeric string) → ISO timestamptz; null when absent/unparseable. */
function msToIso(raw: unknown): string | null {
  if (raw == null) return null
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(num) || num <= 0) return null
  // Dialpad sends unix-ms; tolerate seconds just in case.
  const ms = num > 1e12 ? num : num * 1000
  const dt = new Date(ms)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/** Dialpad sends durations as float ms. → whole seconds, null when absent. */
function msToSec(raw: unknown): number | null {
  if (raw == null) return null
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num / 1000)
}

function asString(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return s || null
}

function asBigintString(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return /^\d+$/.test(s) ? s : null
}

export type DialpadState = 'hangup' | 'recap_summary' | 'other'

export type ParsedCallEvent = {
  state: DialpadState
  callId: string | null
  direction: 'inbound' | 'outbound' | null
  externalNumber: string | null
  rwUserId: string | null
  rwUserName: string | null
  startedAt: string | null
  connectedAt: string | null
  endedAt: string | null
  talkSec: number | null
  totalSec: number | null
  summary: string | null
}

/**
 * Normalize a raw call-events payload. Defensive about field placement — the
 * call object may be at the top level or nested under `call`.
 */
export function parseCallEvent(payload: Record<string, unknown>): ParsedCallEvent {
  const call = (payload.call as Record<string, unknown> | undefined) ?? payload

  const rawState = asString(payload.state ?? call.state ?? payload.event)?.toLowerCase() ?? ''
  const state: DialpadState =
    rawState === 'hangup' ? 'hangup' : rawState === 'recap_summary' ? 'recap_summary' : 'other'

  const rawDirection = asString(call.direction)?.toLowerCase()
  const direction = rawDirection === 'inbound' || rawDirection === 'outbound' ? rawDirection : null

  const target = (call.target as Record<string, unknown> | undefined) ?? {}

  // recap_summary may arrive as a bare string or as { summary } / { recap_summary }.
  const recap = call.recap_summary ?? payload.recap_summary
  const summary =
    typeof recap === 'string'
      ? asString(recap)
      : asString((recap as Record<string, unknown> | undefined)?.summary)

  return {
    state,
    callId: asBigintString(call.call_id ?? payload.call_id),
    direction,
    externalNumber: asString(call.external_number),
    rwUserId: asBigintString(target.id),
    rwUserName: asString(target.name),
    startedAt: msToIso(call.date_started),
    connectedAt: msToIso(call.date_connected),
    endedAt: msToIso(call.date_ended),
    talkSec: msToSec(call.duration),
    totalSec: msToSec(call.total_duration),
    summary,
  }
}

export type MatchResult = {
  status: 'matched' | 'unmatched' | 'dismissed'
  locationId: string | null
  contactId: string | null
}

/**
 * Resolve an external number to a shop. Dismissed numbers short-circuit. A
 * contact scoped to a location resolves directly; a contact known only at the
 * account level resolves when that account has exactly one location. Anything
 * else is unmatched and goes to the manual-match queue.
 */
export async function matchExternalNumber(externalNumber: string | null): Promise<MatchResult> {
  const key = phoneMatchKey(externalNumber)
  if (!key) return { status: 'unmatched', locationId: null, contactId: null }

  const { data: ignored } = await supabaseAdmin
    .from('dialpad_ignored_numbers')
    .select('external_number')
    .eq('external_number', key)
    .maybeSingle()
  if (ignored) return { status: 'dismissed', locationId: null, contactId: null }

  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('id, location_id, account_id')
    .eq('phone_e164', key)

  if (!contacts || contacts.length === 0) {
    return { status: 'unmatched', locationId: null, contactId: null }
  }

  // Prefer a location-scoped contact.
  const scoped = contacts.find(c => c.location_id) ?? contacts[0]
  if (scoped.location_id) {
    return { status: 'matched', locationId: scoped.location_id, contactId: scoped.id }
  }

  // Account-only contact: resolve if the account owns exactly one location.
  if (scoped.account_id) {
    const { data: locs } = await activeLocations(supabaseAdmin, 'id').eq(
      'account_id',
      scoped.account_id,
    )
    if (locs && locs.length === 1) {
      return { status: 'matched', locationId: locs[0].id, contactId: scoped.id }
    }
  }

  // We know the contact but can't pin a single shop — queue it for a human.
  return { status: 'unmatched', locationId: null, contactId: scoped.id }
}

/**
 * Assign a queued call to a shop. Sets the match, leaves the queue, and writes
 * the number back to the shop's contacts so the same number auto-matches next
 * time (the queue's self-extinguishing mechanism, P0-3). Returns false if the
 * call_id doesn't exist.
 */
export async function assignCallToShop(opts: {
  callId: number
  locationId: string
  resolvedBy: string
}): Promise<boolean> {
  const { callId, locationId, resolvedBy } = opts

  const { data: call } = await supabaseAdmin
    .from('shop_call_activity')
    .select('call_id, external_number')
    .eq('call_id', callId)
    .maybeSingle()
  if (!call) return false

  const key = phoneMatchKey(call.external_number)

  // Write the number back to a contact on this shop so it auto-matches later.
  // Skip if a contact under this location already carries the number.
  let contactId: string | null = null
  if (key) {
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('location_id', locationId)
      .eq('phone_e164', key)
      .maybeSingle()
    if (existing) {
      contactId = existing.id
    } else {
      const { data: inserted } = await supabaseAdmin
        .from('contacts')
        .insert({
          location_id: locationId,
          phone: call.external_number,
          role: 'other',
          name: 'Added from Dialpad call',
        })
        .select('id')
        .single()
      contactId = inserted?.id ?? null
    }
  }

  await supabaseAdmin
    .from('shop_call_activity')
    .update({
      location_id: locationId,
      contact_id: contactId,
      match_status: 'manually_matched',
      in_queue: false,
      matched_by: resolvedBy,
      matched_at: new Date().toISOString(),
    })
    .eq('call_id', callId)

  return true
}

/**
 * Dismiss a queued call as "not a shop". Leaves the queue and adds the number to
 * the ignore list so it never re-queues. Returns false if the call_id doesn't exist.
 */
export async function dismissCall(opts: {
  callId: number
  dismissedBy: string
}): Promise<boolean> {
  const { callId, dismissedBy } = opts

  const { data: call } = await supabaseAdmin
    .from('shop_call_activity')
    .select('call_id, external_number')
    .eq('call_id', callId)
    .maybeSingle()
  if (!call) return false

  const key = phoneMatchKey(call.external_number)
  if (key) {
    await supabaseAdmin
      .from('dialpad_ignored_numbers')
      .upsert({ external_number: key, dismissed_by: dismissedBy }, { onConflict: 'external_number' })
  }

  await supabaseAdmin
    .from('shop_call_activity')
    .update({
      match_status: 'dismissed',
      in_queue: false,
      matched_by: dismissedBy,
      matched_at: new Date().toISOString(),
    })
    .eq('call_id', callId)

  return true
}

/** "3m 12s", "45s", or null when unknown. */
export function formatCallDuration(totalSec: number | null | undefined): string | null {
  if (totalSec == null || totalSec <= 0) return null
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export type ShopCallRow = {
  call_id: number
  location_id: string | null
  direction: string | null
  rw_user_name: string | null
  external_number: string | null
  started_at: string | null
  total_sec: number | null
  summary: string | null
}

/**
 * Shape a shop_call_activity row as an ActivityFeed entry so synced calls render
 * inline on the shop timeline without being copied into activity_log. body is
 * null while the AI recap is still processing.
 */
export function callToActivityEntry(call: ShopCallRow) {
  const dir = call.direction === 'inbound' ? 'Inbound' : 'Outbound'
  const who = call.rw_user_name ? ` · ${call.rw_user_name}` : ''
  const duration = formatCallDuration(call.total_sec)
  const durationSuffix = duration ? ` (${duration})` : ''
  return {
    id: `call-${call.call_id}`,
    type: 'call' as const,
    subject: `${dir} call${who}${durationSuffix}`,
    body: call.summary,
    sent_by: 'Dialpad',
    created_at: call.started_at ?? new Date().toISOString(),
    location_id: call.location_id ?? undefined,
  }
}
