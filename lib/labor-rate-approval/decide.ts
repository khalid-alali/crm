import type { SupabaseClient } from '@supabase/supabase-js'
import { logLaborRateApprovalEvent } from '@/lib/labor-rate-approval/activity'
import { markLaborRateChecklistItem } from '@/lib/labor-rate-approval/checklist'
import { isTokenActionable } from '@/lib/labor-rate-approval/row'
import type { LaborRateApprovalRow } from '@/lib/labor-rate-approval/types'

export type DecideInput = {
  action: 'approve' | 'changes_requested'
  decidedByName: string
  confirmChecked?: boolean
  reason?: string | null
}

export class LaborRateDecisionError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'already_decided' | 'validation',
  ) {
    super(message)
    this.name = 'LaborRateDecisionError'
  }
}

export async function decideLaborRateApproval(
  supabase: SupabaseClient,
  token: string,
  input: DecideInput,
): Promise<LaborRateApprovalRow> {
  const trimmedToken = token.trim()
  if (!trimmedToken) throw new LaborRateDecisionError('Invalid token', 'not_found')

  const name = input.decidedByName.trim()
  if (!name) throw new LaborRateDecisionError('Name is required', 'validation')

  if (input.action === 'approve' && !input.confirmChecked) {
    throw new LaborRateDecisionError('Please confirm approval', 'validation')
  }

  if (input.action === 'changes_requested') {
    const reason = (input.reason ?? '').trim()
    if (!reason) throw new LaborRateDecisionError('Reason is required', 'validation')
  }

  const { data: row, error } = await supabase
    .from('labor_rate_approvals')
    .select('*')
    .eq('decision_token', trimmedToken)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new LaborRateDecisionError('Approval not found', 'not_found')

  const approval = row as LaborRateApprovalRow
  if (!isTokenActionable(approval)) {
    throw new LaborRateDecisionError('This request has already been decided', 'already_decided')
  }

  const now = new Date().toISOString()
  const newStatus = input.action === 'approve' ? 'approved' : 'changes_requested'

  const patch: Record<string, unknown> = {
    status: newStatus,
    decided_at: now,
    decided_by_name: name,
    token_used_at: now,
    updated_at: now,
  }
  if (input.action === 'changes_requested') {
    patch.decision_reason = (input.reason ?? '').trim()
  } else {
    patch.decision_reason = null
  }

  const { data: updated, error: updateError } = await supabase
    .from('labor_rate_approvals')
    .update(patch)
    .eq('id', approval.id)
    .select('*')
    .single()
  if (updateError) throw new Error(updateError.message)

  const result = updated as LaborRateApprovalRow

  await logLaborRateApprovalEvent(
    supabase,
    result.location_id,
    {
      event: input.action === 'approve' ? 'approved' : 'changes_requested',
      approval_id: result.id,
      status: newStatus,
      charge_rate: Number(result.charge_rate),
      actor_name: name,
      reason: input.action === 'changes_requested' ? (input.reason ?? '').trim() : null,
    },
    name,
  )

  if (input.action === 'approve') {
    await markLaborRateChecklistItem(supabase, result.location_id, 'labor_rate_approved', true, null)
  }

  return result
}
