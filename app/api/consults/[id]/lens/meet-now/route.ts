import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { startLensMeetNow } from '@/lib/expert-assist/lens-sessions'

export const runtime = 'nodejs'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: caseId } = await ctx.params

  try {
    const result = await startLensMeetNow(caseId, session.user.email)
    return NextResponse.json({
      ok: true,
      lens_session_id: result.lensSessionId,
      technician_url: result.technicianUrl,
      scheduled_start_at: result.scheduledStartAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lens session failed'
    const status = msg.includes('not configured') ? 503 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
