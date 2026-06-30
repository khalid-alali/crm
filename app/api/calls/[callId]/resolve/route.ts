import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { assignCallToShop } from '@/lib/dialpad'
import { canAccessCallQueue } from '@/lib/calls-access'

// Assign a queued Dialpad call to a shop (manual-match queue, P0-3).
export async function POST(req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessCallQueue(session.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { callId: callIdRaw } = await params
  const callId = Number(callIdRaw)
  if (!Number.isFinite(callId)) {
    return NextResponse.json({ error: 'Invalid call id' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { locationId?: string }
  const locationId = body.locationId?.trim()
  if (!locationId) {
    return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
  }

  const resolvedBy = session.user?.email ?? session.user?.name ?? 'unknown'
  const result = await assignCallToShop({ callId, locationId, resolvedBy })
  if (!result) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    externalNumber: result.externalNumber,
    updatedCount: result.updatedCount,
  })
}
