import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  decideLaborRateApproval,
  LaborRateDecisionError,
} from '@/lib/labor-rate-approval/decide'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  let body: {
    action?: string
    decided_by_name?: string
    confirm_checked?: boolean
    reason?: string | null
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action === 'approve' || body.action === 'changes_requested' ? body.action : null
  if (!action) {
    return NextResponse.json({ error: 'action must be approve or changes_requested' }, { status: 400 })
  }

  try {
    const row = await decideLaborRateApproval(supabaseAdmin, token, {
      action,
      decidedByName: typeof body.decided_by_name === 'string' ? body.decided_by_name : '',
      confirmChecked: body.confirm_checked === true,
      reason: body.reason,
    })
    revalidatePath('/vinfast')
    return NextResponse.json({ ok: true, approval: row })
  } catch (e: unknown) {
    if (e instanceof LaborRateDecisionError) {
      const status =
        e.code === 'not_found' ? 404 : e.code === 'already_decided' ? 409 : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    const msg = e instanceof Error ? e.message : 'Decision failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
