import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function coerceSeconds(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = (await req.json()) as { action?: string }
  if (action !== 'start' && action !== 'pause' && action !== 'stop') {
    return NextResponse.json({ error: 'action must be start, pause, or stop' }, { status: 400 })
  }

  const { id: caseId } = await ctx.params

  const { data: c, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, timer_started_at, timer_stopped_at, billable_seconds')
    .eq('id', caseId)
    .maybeSingle()

  if (error || !c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if ((c as { status: string }).status !== 'open') {
    return NextResponse.json({ error: 'Timer only on open cases' }, { status: 400 })
  }

  const row = c as {
    timer_started_at: string | null
    timer_stopped_at: string | null
    billable_seconds: number | null
  }

  const now = new Date()
  const nowIso = now.toISOString()
  let nextStarted: string | null = row.timer_started_at
  let nextStopped: string | null = row.timer_stopped_at
  let accumulated = coerceSeconds(row.billable_seconds)

  if (action === 'start') {
    if (row.timer_started_at) {
      return NextResponse.json({ error: 'Timer already running' }, { status: 400 })
    }
    nextStarted = nowIso
    nextStopped = null
    await insertConsultCaseEvent({
      caseId,
      eventType: 'timer_started',
      actorType: 'expert',
      actorId: session.user.email,
      metadata: {},
    })
  }

  if (action === 'pause' || action === 'stop') {
    if (!row.timer_started_at) {
      return NextResponse.json({ error: 'Timer is not running' }, { status: 400 })
    }
    const start = new Date(row.timer_started_at).getTime()
    const delta = Math.max(0, Math.floor((now.getTime() - start) / 1000))
    accumulated += delta
    nextStarted = null
    if (action === 'stop') nextStopped = nowIso
    else nextStopped = null

    await insertConsultCaseEvent({
      caseId,
      eventType: 'timer_stopped',
      actorType: 'expert',
      actorId: session.user.email,
      metadata: { action, delta_seconds: delta, billable_seconds: accumulated },
    })
  }

  const { error: upErr } = await supabaseAdmin
    .from('consult_cases')
    .update({
      timer_started_at: nextStarted,
      timer_stopped_at: nextStopped,
      billable_seconds: accumulated,
    })
    .eq('id', caseId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)
  return NextResponse.json({ ok: true, billable_seconds: accumulated })
}
