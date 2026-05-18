import { NextRequest, NextResponse } from 'next/server'
import { CONSULT_MEDIA_BUCKET } from '@/lib/expert-assist/constants'
import { verifyConsultMediaPath } from '@/lib/expert-assist/mms-media-url'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

/** Public, signed media fetch for Twilio outbound MMS (no session). */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')?.trim() ?? ''
  const exp = Number.parseInt(req.nextUrl.searchParams.get('exp') ?? '', 10)
  const sig = req.nextUrl.searchParams.get('sig')?.trim() ?? ''

  if (!path || !Number.isFinite(exp) || !sig) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!verifyConsultMediaPath(path, exp, sig)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin.storage.from(CONSULT_MEDIA_BUCKET).download(path)
  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const buf = Buffer.from(await data.arrayBuffer())
  const contentType = data.type || 'application/octet-stream'

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
