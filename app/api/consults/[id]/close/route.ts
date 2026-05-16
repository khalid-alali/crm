import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { closeConsultCaseWithBilling } from '@/lib/expert-assist/close-consult'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { billable_seconds_override } = (await req.json().catch(() => ({}))) as {
    billable_seconds_override?: number | null
  }

  const { id: caseId } = await ctx.params

  const res = await closeConsultCaseWithBilling({
    caseId,
    expertEmail: session.user.email ?? null,
    billableSecondsOverride: billable_seconds_override,
    source: 'expert',
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, billingFailed: res.billingFailed }, { status: res.billingFailed ? 402 : 400 })
  }

  return NextResponse.json({ ok: true, amountLabel: res.amountLabel, amountCents: res.amountCents })
}
