import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { assertShopCanRunConsults } from '@/lib/expert-assist/billing-gates'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { sendConsultSms } from '@/lib/expert-assist/send-sms'
import { notifyExpertAssistSlack } from '@/lib/expert-assist/slack'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (!c.shop_id || !c.originating_contact_id) {
    return NextResponse.json({ error: 'Case missing shop or contact' }, { status: 400 })
  }

  const gate = await assertShopCanRunConsults(c.shop_id)
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 400 })

  const now = new Date().toISOString()
  const { error: upC } = await supabaseAdmin
    .from('shop_approved_contacts')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by_user_id: session.user.email,
    })
    .eq('id', c.originating_contact_id)

  if (upC) return NextResponse.json({ error: upC.message }, { status: 500 })

  const { error: upCase } = await supabaseAdmin.from('consult_cases').update({ status: 'open' }).eq('id', caseId)

  if (upCase) return NextResponse.json({ error: upCase.message }, { status: 500 })

  await insertConsultCaseEvent({
    caseId,
    eventType: 'contact_approved',
    actorType: 'expert',
    actorId: session.user.email,
    metadata: { contact_id: c.originating_contact_id },
  })

  await sendConsultSms({
    to: c.originating_phone_number,
    body: 'Verified. An expert will be in touch in ~2 min.',
    caseId,
    logDirection: 'system',
  })

  const { data: shop } = await supabaseAdmin.from('locations').select('name').eq('id', c.shop_id).maybeSingle()
  await notifyExpertAssistSlack({
    type: 'approved',
    caseId,
    shopName: (shop as { name: string } | null)?.name ?? '',
  })

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)

  return NextResponse.json({ ok: true })
}
