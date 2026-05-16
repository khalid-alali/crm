import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { sendConsultSms } from '@/lib/expert-assist/send-sms'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = (await req.json()) as { text?: string }
  const body = typeof text === 'string' ? text.trim() : ''
  if (!body) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const { id: caseId } = await ctx.params

  const { data: c, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, originating_phone_number')
    .eq('id', caseId)
    .maybeSingle()

  if (error || !c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'open') {
    return NextResponse.json({ error: 'Can only message open cases' }, { status: 400 })
  }

  await sendConsultSms({
    to: c.originating_phone_number,
    body,
    caseId,
    logDirection: 'outbound',
  })

  await insertConsultCaseEvent({
    caseId,
    eventType: 'note_added',
    actorType: 'expert',
    actorId: session.user.email,
    metadata: { kind: 'sms_outbound' },
  })

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)
  return NextResponse.json({ ok: true })
}
