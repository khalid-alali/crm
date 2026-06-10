import type { SupabaseClient } from '@supabase/supabase-js'
import { logLaborRateApprovalEvent } from '@/lib/labor-rate-approval/activity'
import { markLaborRateChecklistItem } from '@/lib/labor-rate-approval/checklist'
import { laborRateApproverEmails } from '@/lib/labor-rate-approval/config'
import { sendLaborRateApprovalEmail } from '@/lib/labor-rate-approval/email'
import { slaDueAt } from '@/lib/labor-rate-approval/sla'
import { generateDecisionToken } from '@/lib/labor-rate-approval/tokens'
import type { LaborRateApprovalRow } from '@/lib/labor-rate-approval/types'
import { VINFAST_PROGRAM_ID } from '@/lib/program-config'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function submitLaborRateApproval(
  supabase: SupabaseClient,
  input: {
    locationId: string
    chargeRate: number
    submittedByEmail: string
    benchmarkAverageRate?: number | null
    benchmarkShopsSurveyed?: number | null
  },
): Promise<LaborRateApprovalRow> {
  const { locationId, chargeRate, submittedByEmail, benchmarkAverageRate, benchmarkShopsSurveyed } =
    input
  if (!UUID_RE.test(locationId)) throw new Error('Invalid location id')
  if (!Number.isFinite(chargeRate) || chargeRate <= 0) throw new Error('Charge rate must be greater than 0')

  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('id, name, city, state, warranty_labor_rate')
    .eq('id', locationId)
    .maybeSingle()
  if (locError) throw new Error(locError.message)
  if (!location) throw new Error('Location not found')

  const warrantyRate = location.warranty_labor_rate
  if (warrantyRate == null || !Number.isFinite(Number(warrantyRate))) {
    throw new Error('Warranty labor rate must be set on the shop before submitting for approval')
  }

  const { data: enrollment, error: enrollError } = await supabase
    .from('location_program_enrollments')
    .select('id')
    .eq('location_id', locationId)
    .eq('program_id', VINFAST_PROGRAM_ID)
    .is('unenrolled_at', null)
    .maybeSingle()
  if (enrollError) throw new Error(enrollError.message)
  if (!enrollment) throw new Error('Shop is not enrolled in VinFast')

  const { data: existing, error: existingError } = await supabase
    .from('labor_rate_approvals')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)

  const now = new Date()
  const token = generateDecisionToken()
  const isResubmit = existing?.status === 'changes_requested'

  if (existing?.status === 'approved') {
    throw new Error('Labor rate is already approved for this shop')
  }

  let row: LaborRateApprovalRow

  if (existing) {
    const patch: Record<string, unknown> = {
      warranty_rate: Number(warrantyRate),
      charge_rate: chargeRate,
      status: 'requested',
      decision_token: token,
      token_used_at: null,
      decided_at: null,
      decided_by_name: null,
      decision_reason: null,
      submitted_by_email: submittedByEmail,
      updated_at: now.toISOString(),
    }

    const { data: updated, error: updateError } = await supabase
      .from('labor_rate_approvals')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (updateError) throw new Error(updateError.message)
    row = updated as LaborRateApprovalRow
  } else {
    const submittedAt = now.toISOString()
    const { data: inserted, error: insertError } = await supabase
      .from('labor_rate_approvals')
      .insert({
        location_id: locationId,
        warranty_rate: Number(warrantyRate),
        charge_rate: chargeRate,
        status: 'requested',
        submitted_by_email: submittedByEmail,
        submitted_at: submittedAt,
        sla_due_at: slaDueAt(now).toISOString(),
        decision_token: token,
      })
      .select('*')
      .single()
    if (insertError) throw new Error(insertError.message)
    row = inserted as LaborRateApprovalRow
  }

  const approvers = laborRateApproverEmails()
  const newThreadMessageId = await sendLaborRateApprovalEmail(
    approvers,
    {
      shopName: location.name,
      city: location.city,
      state: location.state,
      chargeRate,
      decisionToken: token,
      submittedAt: row.submitted_at,
      benchmarkAverageRate,
      benchmarkShopsSurveyed,
    },
    {
      approvalId: row.id,
      emailThreadMessageId: row.email_thread_message_id,
    },
  )

  if (newThreadMessageId) {
    const { error: threadError } = await supabase
      .from('labor_rate_approvals')
      .update({ email_thread_message_id: newThreadMessageId })
      .eq('id', row.id)
    if (threadError) throw new Error(threadError.message)
    row = { ...row, email_thread_message_id: newThreadMessageId }
  }

  await logLaborRateApprovalEvent(
    supabase,
    locationId,
    {
      event: isResubmit ? 'resubmitted' : 'submitted',
      approval_id: row.id,
      status: 'requested',
      charge_rate: chargeRate,
      actor_name: submittedByEmail,
    },
    submittedByEmail,
  )

  await markLaborRateChecklistItem(supabase, locationId, 'labor_rate_requested', true, submittedByEmail)

  return row
}
