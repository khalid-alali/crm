import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { scheduleLensConsultVideo } from '@/lib/expert-assist/lens-sessions'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: caseId } = await ctx.params
  const body = (await req.json()) as { scheduled_start_at?: string }
  const scheduledStartAt = body.scheduled_start_at?.trim()
  if (!scheduledStartAt) {
    return NextResponse.json({ error: 'scheduled_start_at is required' }, { status: 400 })
  }

  try {
    const result = await scheduleLensConsultVideo(caseId, session.user.email, scheduledStartAt)
    return NextResponse.json({
      ok: true,
      lens_session_id: result.lensSessionId,
      technician_url: result.technicianUrl,
      scheduled_start_at: result.scheduledStartAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lens schedule failed'
    const status = msg.includes('not configured') ? 503 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
