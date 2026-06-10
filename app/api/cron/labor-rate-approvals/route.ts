import { NextRequest, NextResponse } from 'next/server'
import { logLaborRateApprovalEvent } from '@/lib/labor-rate-approval/activity'
import { cronActionForRow } from '@/lib/labor-rate-approval/cron-schedule'
import {
  laborRateApproverEmails,
  laborRateEscalationEmail,
} from '@/lib/labor-rate-approval/config'
import { sendLaborRateApprovalEmail } from '@/lib/labor-rate-approval/email'
import type { LaborRateApprovalRow } from '@/lib/labor-rate-approval/types'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_LABOR_RATE_TOKEN?.trim() ?? ''
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('labor_rate_approvals')
    .select('*')
    .in('status', ['requested', 'changes_requested', 'escalated'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approvals = (rows ?? []) as LaborRateApprovalRow[]
  const now = new Date()
  const results: { id: string; action: string }[] = []

  for (const row of approvals) {
    const action = cronActionForRow(row.submitted_at, row.status, now)
    if (action.kind === 'none') continue

    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('name, city, state')
      .eq('id', row.location_id)
      .maybeSingle()
    if (!location) continue

    if (action.kind === 'escalate') {
      const escalatedAt = now.toISOString()
      const { error: updateError } = await supabaseAdmin
        .from('labor_rate_approvals')
        .update({
          status: 'escalated',
          escalated_at: escalatedAt,
          updated_at: escalatedAt,
        })
        .eq('id', row.id)
      if (updateError) {
        results.push({ id: row.id, action: `error: ${updateError.message}` })
        continue
      }

      await logLaborRateApprovalEvent(
        supabaseAdmin,
        row.location_id,
        {
          event: 'escalated',
          approval_id: row.id,
          status: 'escalated',
          charge_rate: Number(row.charge_rate),
          actor_name: 'system',
        },
        'cron',
      )

      const escalationEmail = laborRateEscalationEmail()
      if (escalationEmail) {
        const newThreadMessageId = await sendLaborRateApprovalEmail(
          [escalationEmail],
          {
            shopName: location.name,
            city: location.city,
            state: location.state,
            chargeRate: Number(row.charge_rate),
            decisionToken: row.decision_token,
            submittedAt: row.submitted_at,
            isEscalation: true,
          },
          {
            approvalId: row.id,
            emailThreadMessageId: row.email_thread_message_id,
          },
        )
        if (newThreadMessageId) {
          await supabaseAdmin
            .from('labor_rate_approvals')
            .update({ email_thread_message_id: newThreadMessageId })
            .eq('id', row.id)
        }
      }

      results.push({ id: row.id, action: 'escalated' })
      continue
    }

    const recipients =
      action.kind === 'reminder_escalation'
        ? laborRateEscalationEmail()
          ? [laborRateEscalationEmail()!]
          : []
        : laborRateApproverEmails()

    if (recipients.length === 0) {
      results.push({ id: row.id, action: `skip: no recipients for ${action.kind}` })
      continue
    }

    const newThreadMessageId = await sendLaborRateApprovalEmail(
      recipients,
      {
        shopName: location.name,
        city: location.city,
        state: location.state,
        chargeRate: Number(row.charge_rate),
        decisionToken: row.decision_token,
        submittedAt: row.submitted_at,
        isReminder: true,
        isEscalation: action.kind === 'reminder_escalation',
      },
      {
        approvalId: row.id,
        emailThreadMessageId: row.email_thread_message_id,
      },
    )
    if (newThreadMessageId) {
      await supabaseAdmin
        .from('labor_rate_approvals')
        .update({ email_thread_message_id: newThreadMessageId })
        .eq('id', row.id)
    }

    await logLaborRateApprovalEvent(
      supabaseAdmin,
      row.location_id,
      {
        event: 'reminder_sent',
        approval_id: row.id,
        status: row.status,
        charge_rate: Number(row.charge_rate),
        actor_name: 'system',
        reminder_day: action.day,
      },
      'cron',
    )

    results.push({ id: row.id, action: `${action.kind} day ${action.day}` })
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
