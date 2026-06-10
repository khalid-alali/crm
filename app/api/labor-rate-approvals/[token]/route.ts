import { NextRequest, NextResponse } from 'next/server'
import { isTokenActionable } from '@/lib/labor-rate-approval/row'
import type { LaborRateApprovalRow } from '@/lib/labor-rate-approval/types'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const trimmed = token?.trim() ?? ''
  if (!trimmed) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const { data: row, error } = await supabaseAdmin
    .from('labor_rate_approvals')
    .select('*')
    .eq('decision_token', trimmed)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const approval = row as LaborRateApprovalRow

  const { data: location, error: locError } = await supabaseAdmin
    .from('locations')
    .select('name, city, state')
    .eq('id', approval.location_id)
    .maybeSingle()
  if (locError) return NextResponse.json({ error: locError.message }, { status: 500 })

  const actionable = isTokenActionable(approval)

  return NextResponse.json({
    shopName: location?.name ?? 'Shop',
    city: location?.city ?? null,
    state: location?.state ?? null,
    chargeRate: Number(approval.charge_rate),
    status: approval.status,
    actionable,
    decidedAt: approval.decided_at,
    decidedByName: approval.decided_by_name,
    decisionReason: approval.decision_reason,
  })
}
