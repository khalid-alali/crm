import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_CONSULTS_TOKEN?.trim() ?? ''
  return Boolean(expected && token === expected)
}

/** Placeholder: Twilio media rehost retries belong here; implement with explicit failed-upload flags if needed. */
export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ retried: 0, note: 'no-op' })
}
