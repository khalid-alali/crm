import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  verifyAndDecodeWebhook,
  parseCallEvent,
  matchExternalNumber,
  QUEUE_DURATION_FLOOR_SEC,
} from '@/lib/dialpad'

// Dialpad call-events webhook. The body is an HS256 JWT signed with the
// webhook's secret. Two states are subscribed: `hangup` (metadata, summary
// null) and `recap_summary` (the AI recap, on a separate later event). Either
// may arrive first; the row is upserted on call_id so it ends up complete and
// singular. Failures return non-2xx so Dialpad retries.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const payload = verifyAndDecodeWebhook(rawBody)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = parseCallEvent(payload)
  if (!event.callId) {
    // Nothing we can key on — ack so Dialpad doesn't retry forever.
    return NextResponse.json({ ok: true, skipped: 'no call_id' })
  }

  try {
    if (event.state === 'recap_summary') {
      // Patch the summary onto the existing row (or seed one if recap landed
      // first). Never overwrites metadata — only summary fields are sent.
      const { error } = await supabaseAdmin.from('shop_call_activity').upsert(
        {
          call_id: Number(event.callId),
          summary: event.summary,
          summary_at: new Date().toISOString(),
        },
        { onConflict: 'call_id' },
      )
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (event.state === 'hangup') {
      const match = await matchExternalNumber(event.externalNumber)

      // Queue noise guard: only connected calls above the duration floor enter
      // the active manual-match queue. Everything is still written.
      const passesNoiseGuard =
        Boolean(event.connectedAt) && (event.totalSec ?? 0) >= QUEUE_DURATION_FLOOR_SEC
      const inQueue = match.status === 'unmatched' && passesNoiseGuard

      // Omit summary/summary_at so a recap that arrived first is never clobbered.
      const { error } = await supabaseAdmin.from('shop_call_activity').upsert(
        {
          call_id: Number(event.callId),
          location_id: match.locationId,
          contact_id: match.contactId,
          direction: event.direction,
          rw_user_id: event.rwUserId ? Number(event.rwUserId) : null,
          rw_user_name: event.rwUserName,
          external_number: event.externalNumber,
          started_at: event.startedAt,
          connected_at: event.connectedAt,
          ended_at: event.endedAt,
          talk_sec: event.talkSec,
          total_sec: event.totalSec,
          match_status: match.status,
          in_queue: inQueue,
        },
        { onConflict: 'call_id' },
      )
      if (error) throw error

      // Calls render on the shop timeline by reading shop_call_activity directly
      // (see app/(internal)/shops/[id]/page.tsx) — we don't copy into
      // activity_log, so the summary stays correct as it's patched in later and
      // Dialpad retries can't create duplicate timeline rows.
      return NextResponse.json({ ok: true })
    }

    // Other states (ringing, connected, etc.) aren't subscribed but ack cleanly.
    return NextResponse.json({ ok: true, skipped: event.state })
  } catch (e) {
    console.error('[dialpad webhook] Failed to process event', {
      call_id: event.callId,
      state: event.state,
      error: e,
    })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
