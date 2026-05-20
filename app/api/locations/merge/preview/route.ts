import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import {
  buildLocationMergePreview,
  buildMergePreviewFromPair,
} from '@/lib/location-merge/preview'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rec = body as Record<string, unknown>
  const primaryId = typeof rec.primaryId === 'string' ? rec.primaryId.trim() : ''
  const secondaryId = typeof rec.secondaryId === 'string' ? rec.secondaryId.trim() : ''
  const locationAId = typeof rec.locationAId === 'string' ? rec.locationAId.trim() : ''
  const locationBId = typeof rec.locationBId === 'string' ? rec.locationBId.trim() : ''

  try {
    const preview =
      primaryId && secondaryId
        ? await buildLocationMergePreview(supabaseAdmin, { primaryId, secondaryId })
        : locationAId && locationBId
          ? await buildMergePreviewFromPair(supabaseAdmin, locationAId, locationBId)
          : null

    if (!preview) {
      return NextResponse.json(
        { error: 'Provide primaryId+secondaryId or locationAId+locationBId' },
        { status: 400 },
      )
    }

    return NextResponse.json(preview)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Preview failed'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
