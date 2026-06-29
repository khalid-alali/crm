import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { dismissCall } from '@/lib/dialpad'

// Dismiss a queued Dialpad call as "not a shop" (manual-match queue, P0-3).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callId: callIdRaw } = await params
  const callId = Number(callIdRaw)
  if (!Number.isFinite(callId)) {
    return NextResponse.json({ error: 'Invalid call id' }, { status: 400 })
  }

  const dismissedBy = session.user?.email ?? session.user?.name ?? 'unknown'
  const ok = await dismissCall({ callId, dismissedBy })
  if (!ok) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
