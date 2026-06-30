import { NextRequest, NextResponse } from 'next/server'
import {
  verifyAndDecodeWebhook,
  parseCallEvent,
  upsertShopCallHangup,
  upsertShopCallRecap,
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
      await upsertShopCallRecap(event.callId, event.summary, event)
      return NextResponse.json({ ok: true })
    }

    if (event.state === 'hangup') {
      const persisted = await upsertShopCallHangup(event)
      if (!persisted) return NextResponse.json({ ok: true, skipped: 'short_or_voicemail' })

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
