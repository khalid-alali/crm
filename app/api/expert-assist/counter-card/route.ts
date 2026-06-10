import { NextRequest, NextResponse } from 'next/server'
import { buildCounterCardPdf } from '@/lib/activation/counter-card-pdf'
import { recordCounterCardDownload } from '@/lib/activation/ingest'
import { getAppSession } from '@/lib/app-auth'
import { ensureToolboxCasePartner } from '@/lib/expert-assist/toolbox-partner'
import { activeLocations } from '@/lib/locations-active'
import { supabaseAdmin } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locationId = req.nextUrl.searchParams.get('locationId')?.trim() ?? ''
  if (!UUID_RE.test(locationId)) {
    return NextResponse.json({ error: 'Invalid locationId' }, { status: 400 })
  }

  const { data: location, error } = await activeLocations(supabaseAdmin, 'id, name').eq('id', locationId).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const shopName = (location as { name: string }).name
  const casePartner = await ensureToolboxCasePartner(locationId, shopName)

  try {
    await recordCounterCardDownload(locationId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record download'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const pdfBytes = await buildCounterCardPdf({ shopName, casePartner })
  const filename = `expert-assist-counter-card-${casePartner}.pdf`

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
