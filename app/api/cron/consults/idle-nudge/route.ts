import { NextRequest, NextResponse } from 'next/server'
import { expertAssistPublicBaseUrl } from '@/lib/expert-assist/constants'
import { postExpertAssistSlack } from '@/lib/expert-assist/slack'
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
  const base = expertAssistPublicBaseUrl()

  const { data: cases, error } = await supabaseAdmin.from('consult_cases').select('id').eq('status', 'open')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let nudged = 0
  for (const c of cases ?? []) {
    const caseId = (c as { id: string }).id
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
      const link = base ? `${base}/consults/${caseId}` : null
      const line = link ?
        `Expert Assist idle nudge: open case ${caseId} — last activity was shop inbound >10 min ago. ${link}`
      : `Expert Assist idle nudge: open case ${caseId} — last activity was shop inbound >10 min ago.`
      await postExpertAssistSlack(line)
      nudged++
    }
  }

  return NextResponse.json({ nudged })
}
