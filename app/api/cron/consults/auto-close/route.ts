import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { closeConsultCaseWithBilling } from '@/lib/expert-assist/close-consult'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_CONSULTS_TOKEN?.trim() ?? ''
  return Boolean(expected && token === expected)
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const idleMs = 4 * 60 * 60 * 1000

  const { data: cases, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id')
    .eq('status', 'open')
    .not('outcome', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const closed: string[] = []
  for (const c of cases ?? []) {
    const caseId = (c as { id: string }).id
    const { data: lastMsg } = await supabaseAdmin
      .from('consult_messages')
      .select('created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastAt = lastMsg?.created_at ? new Date(lastMsg.created_at as string).getTime() : 0
    if (lastAt < Date.now() - idleMs) {
      const res = await closeConsultCaseWithBilling({
        caseId,
        source: 'cron',
        expertEmail: null,
      })
      if (res.ok) closed.push(caseId)
    }
  }

  return NextResponse.json({ closed: closed.length, caseIds: closed })
}
