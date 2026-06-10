import { NextRequest, NextResponse } from 'next/server'
import { recordOwnerForwardClick } from '@/lib/activation/ingest'
import { expertAssistToolkitUrl } from '@/lib/activation/urls'
import { supabaseAdmin } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('locationId')?.trim() ?? ''
  if (!UUID_RE.test(locationId)) {
    return NextResponse.json({ error: 'Invalid locationId' }, { status: 400 })
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('id', locationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const dedupeKey =
    req.nextUrl.searchParams.get('dedupe')?.trim() ||
    `forward-click:${new Date().toISOString().slice(0, 13)}`

  try {
    await recordOwnerForwardClick(locationId, dedupeKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record forward click'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.redirect(expertAssistToolkitUrl(locationId), 302)
}
