import { NextRequest, NextResponse } from 'next/server'
import { notifyExpertAssistSlack } from '@/lib/expert-assist/slack'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_CONSULTS_TOKEN?.trim() ?? ''
  return Boolean(expected && token === expected)
}

export async function POST(_req: NextRequest) {
  if (!authorize(_req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.EXPERT_ASSIST_SLACK_WEBHOOK_URL?.trim()) {
    return NextResponse.json({ skipped: true, reason: 'no EXPERT_ASSIST_SLACK_WEBHOOK_URL' })
  }

  const threshold = Date.now() - 10 * 60 * 1000

  const { data: cases, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, locations(name)')
    .eq('status', 'open')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let nudged = 0
  for (const c of cases ?? []) {
    const row = c as { id: string; locations: { name: string } | { name: string }[] | null }
    const caseId = row.id
    const shopName = Array.isArray(row.locations) ? row.locations[0]?.name : row.locations?.name
    const { data: last } = await supabaseAdmin
      .from('consult_messages')
      .select('created_at, direction')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!last) continue
    if (last.direction !== 'inbound') continue
    const lastAt = new Date(last.created_at as string).getTime()
    if (lastAt < threshold) {
      await notifyExpertAssistSlack({
        type: 'idle_nudge',
        caseId,
        shopName: shopName ?? '',
      })
      nudged++
    }
  }

  return NextResponse.json({ nudged })
}
