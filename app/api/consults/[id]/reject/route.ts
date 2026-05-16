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

  const body = (await req.json().catch(() => ({}))) as { sendSms?: boolean }
  const { id: caseId } = await ctx.params

  const { data: c, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, shop_id, originating_phone_number, originating_contact_id')
    .eq('id', caseId)
    .maybeSingle()

  if (error || !c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'awaiting_expert_approval') {
    return NextResponse.json({ error: 'Case is not awaiting approval' }, { status: 400 })
  }
  if (!c.originating_contact_id) return NextResponse.json({ error: 'No contact on case' }, { status: 400 })

  const now = new Date().toISOString()
  await supabaseAdmin
    .from('shop_approved_contacts')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_by_user_id: session.user.email,
    })
    .eq('id', c.originating_contact_id)

  await supabaseAdmin
    .from('consult_cases')
    .update({ status: 'cancelled', closed_at: now })
    .eq('id', caseId)

  await insertConsultCaseEvent({
    caseId,
    eventType: 'closed',
    actorType: 'expert',
    actorId: session.user.email,
    metadata: { reason: 'rejected' },
  })

  if (body.sendSms !== false && c.shop_id) {
    const { data: shop } = await supabaseAdmin.from('locations').select('name').eq('id', c.shop_id).maybeSingle()
    const name = (shop as { name: string } | null)?.name ?? 'your shop'
    await sendConsultSms({
      to: c.originating_phone_number,
      body: `We couldn't verify your number with ${name}. Contact your shop owner.`,
      caseId,
      logDirection: 'system',
    })
  }

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)

  return NextResponse.json({ ok: true })
}
