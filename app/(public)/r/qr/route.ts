import { NextRequest, NextResponse } from 'next/server'
import { recordQrScan, rejectConsumerShortCodeParams } from '@/lib/activation/ingest'

export async function GET(req: NextRequest) {
  const rejected = rejectConsumerShortCodeParams(req.nextUrl.searchParams)
  if (rejected) {
    return NextResponse.json(
      { error: `${rejected} is not accepted on consumer QR routes — use casePartner` },
      { status: 400 },
    )
  }

  const casePartner = req.nextUrl.searchParams.get('casePartner')?.trim()
  if (!casePartner) {
    return NextResponse.json({ error: 'casePartner query parameter is required' }, { status: 400 })
  }

  const src = req.nextUrl.searchParams.get('src')

  try {
    const result = await recordQrScan({ casePartner, src })
    if (!result) {
      return NextResponse.json({ error: 'Unknown casePartner' }, { status: 404 })
    }

    return NextResponse.redirect(result.redirectUrl, 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QR redirect failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
