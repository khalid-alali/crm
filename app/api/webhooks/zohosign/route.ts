import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyWebhookToken, getDocumentFields } from '@/lib/zohosign'
import { Resend } from 'resend'
import { renderTemplate } from '@/lib/email-templates'
import { notificationsFrom } from '@/lib/resend-notifications'
import { laborRateFromSignedFields, warrantyRateFromSignedFields } from '@/lib/zoho-sign-contract-fields'
import { syncContractPdfFromZoho } from '@/lib/contract-documents'
import { resolvePrimaryContact } from '@/lib/primary-contact'

const resend = new Resend(process.env.RESEND_API_KEY)

type NormalizedZohoEvent = {
  key:
    | 'request_sent'
    | 'request_viewed'
    | 'request_signed'
    | 'request_completed'
    | 'request_declined'
    | 'request_expired'
    | 'request_recalled'
    | 'request_reassigned'
    | 'reminder_sent'
    | 'unknown'
  contractStatus?: 'sent' | 'viewed' | 'signed' | 'declined' | 'revoked'
  activitySubject?: string
  activityBody?: string
  shouldFinalizeSignedContract?: boolean
}

function parseZohoEventTimestamp(raw: unknown): string | null {
  if (raw == null) return null

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const asMs = raw > 1e12 ? raw : raw * 1000
    const dt = new Date(asMs)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  if (/^\d+$/.test(value)) {
    const num = Number.parseInt(value, 10)
    if (!Number.isFinite(num)) return null
    const asMs = num > 1e12 ? num : num * 1000
    const dt = new Date(asMs)
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function extractCompletedAt(payload: Record<string, unknown>, eventRequest: Record<string, unknown>): string | null {
  const action0 = (eventRequest.actions as Array<Record<string, unknown>> | undefined)?.[0] ?? {}
  const candidates: unknown[] = [
    (eventRequest as Record<string, unknown>).completed_time,
    (eventRequest as Record<string, unknown>).completion_time,
    (eventRequest as Record<string, unknown>).completed_on,
    (eventRequest as Record<string, unknown>).request_completed_time,
    action0.completed_time,
    action0.action_time,
    (payload as Record<string, unknown>).completed_time,
    (payload as Record<string, unknown>).completed_on,
    (payload.event as Record<string, unknown> | undefined)?.completed_time,
  ]

  for (const candidate of candidates) {
    const parsed = parseZohoEventTimestamp(candidate)
    if (parsed) return parsed
  }

  return null
}

function normalizeZohoEvent(payload: Record<string, unknown>, eventRequest: Record<string, unknown>): NormalizedZohoEvent {
  const requestStatus = String(eventRequest.request_status ?? '').toLowerCase()
  const actionStatus = String((eventRequest.actions as Array<Record<string, unknown>> | undefined)?.[0]?.action_status ?? '').toUpperCase()
  const eventType = String(
    payload.event_type ??
      (payload.event as Record<string, unknown> | undefined)?.event_type ??
      eventRequest.request_event_type ??
      ''
  ).toLowerCase()

  const action0 = (eventRequest.actions as Array<Record<string, unknown>> | undefined)?.[0] ?? {}
  const recipientName = String(action0.recipient_name ?? '').trim()
  const recipientEmail = String(action0.recipient_email ?? '').trim()
  const recipient = recipientName || recipientEmail || 'Recipient'
  const declinedReason =
    String(action0.decline_reason ?? eventRequest.decline_reason ?? '').trim() || 'No reason provided'
  const recalledBy = String(eventRequest.owner_name ?? eventRequest.owner_email ?? 'sender').trim()
  const reassignedFrom = String(
    (eventRequest as Record<string, unknown>).from_recipient ??
      (eventRequest as Record<string, unknown>).old_recipient_email ??
      ''
  ).trim()
  const reassignedTo = String(
    (eventRequest as Record<string, unknown>).to_recipient ??
      (eventRequest as Record<string, unknown>).new_recipient_email ??
      ''
  ).trim()

  if (eventType.includes('request_sent') || requestStatus === 'sent' || requestStatus === 'inprogress') {
    return {
      key: 'request_sent',
      contractStatus: 'sent',
      activitySubject: 'Contract sent via Zoho Sign',
      activityBody: `Contract sent to ${recipient} for signing.`,
    }
  }
  if (eventType.includes('request_viewed') || actionStatus === 'VIEWED') {
    return {
      key: 'request_viewed',
      contractStatus: 'viewed',
      activitySubject: 'Contract viewed',
      activityBody: `${recipient} viewed the contract.`,
    }
  }
  if (eventType.includes('request_signed') || requestStatus === 'signed') {
    return {
      key: 'request_signed',
      contractStatus: 'signed',
      activitySubject: 'Contract signed',
      activityBody: `${recipient} signed the contract.`,
      shouldFinalizeSignedContract: true,
    }
  }
  if (eventType.includes('request_completed') || requestStatus === 'completed') {
    return {
      key: 'request_completed',
      contractStatus: 'signed',
      activitySubject: 'Contract fully executed',
      activityBody: 'Contract fully executed - all parties signed.',
      shouldFinalizeSignedContract: true,
    }
  }
  if (eventType.includes('request_declined') || requestStatus === 'declined') {
    return {
      key: 'request_declined',
      contractStatus: 'declined',
      activitySubject: 'Contract declined',
      activityBody: `${recipient} declined to sign - ${declinedReason}.`,
    }
  }
  if (eventType.includes('request_expired') || requestStatus === 'expired') {
    return {
      key: 'request_expired',
      contractStatus: 'declined',
      activitySubject: 'Contract expired',
      activityBody: 'Contract expired unsigned.',
    }
  }
  if (eventType.includes('request_recalled') || requestStatus === 'recalled') {
    return {
      key: 'request_recalled',
      contractStatus: 'revoked',
      activitySubject: 'Contract revoked in Zoho Sign',
      activityBody: `Request was recalled (revoked) by ${recalledBy}.`,
    }
  }
  if (eventType.includes('request_reassigned')) {
    return {
      key: 'request_reassigned',
      activitySubject: 'Contract reassigned',
      activityBody: `Signing reassigned from ${reassignedFrom || 'previous recipient'} to ${reassignedTo || 'new recipient'}.`,
    }
  }
  if (eventType.includes('reminder_sent')) {
    return {
      key: 'reminder_sent',
      activitySubject: 'Contract reminder sent',
      activityBody: `Reminder sent to ${recipient}.`,
    }
  }
  return { key: 'unknown' }
}

async function applyContractStatus(
  contractId: string,
  status: 'sent' | 'viewed' | 'signed' | 'declined' | 'revoked',
) {
  let fromStatuses: string[] = []
  if (status === 'sent') fromStatuses = ['draft']
  else if (status === 'viewed') fromStatuses = ['draft', 'sent', 'viewed']
  else if (status === 'signed') fromStatuses = ['draft', 'sent', 'viewed']
  else if (status === 'declined') fromStatuses = ['draft', 'sent', 'viewed']
  else if (status === 'revoked') fromStatuses = ['sent', 'viewed']

  await supabaseAdmin.from('contracts').update({ status }).eq('id', contractId).in('status', fromStatuses)
}

// Zoho Sign sends a token query param or header for verification
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-zoho-webhook-token') ?? ''

  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const payload = (await req.json()) as Record<string, unknown>
  const eventRequest = payload.requests as Record<string, unknown> | undefined

  if (!eventRequest) return NextResponse.json({ ok: true })

  const requestId = String(eventRequest.request_id ?? '').trim()
  if (!requestId) return NextResponse.json({ ok: true })

  const normalized = normalizeZohoEvent(payload, eventRequest)
  if (normalized.key === 'unknown') {
    console.info('[zohosign webhook] Unhandled event', {
      requestId,
      event_type: payload.event_type,
      request_status: eventRequest.request_status,
      action_status: (eventRequest.actions as Array<Record<string, unknown>> | undefined)?.[0]?.action_status,
    })
    return NextResponse.json({ ok: true })
  }

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, account_id, status, doc_storage_path')
    .eq('zoho_sign_request_id', requestId)
    .single()

  if (!contract) {
    console.warn(`[zohosign webhook] No contract with zoho_sign_request_id=${requestId} — send may not have persisted the Zoho request id, or the row was created outside the app. Run: npm run reconcile:zoho`)
    return NextResponse.json({ ok: true })
  }

  const skipRecallDuplicateActivity =
    normalized.key === 'request_recalled' && contract.status === 'revoked'

  if (normalized.contractStatus) {
    await applyContractStatus(contract.id, normalized.contractStatus)
  }

  const { data: contractLocations } = await supabaseAdmin
    .from('contract_locations')
    .select('location_id')
    .eq('contract_id', contract.id)
  const locationIds = contractLocations?.map(cl => cl.location_id) ?? []

  if (
    !skipRecallDuplicateActivity &&
    normalized.activitySubject &&
    normalized.activityBody &&
    locationIds.length > 0
  ) {
    await supabaseAdmin.from('activity_log').insert(
      locationIds.map(locationId => ({
        location_id: locationId,
        type: 'contract',
        subject: normalized.activitySubject,
        body: `${normalized.activityBody}\nRequest ID: ${requestId}`,
        sent_by: 'system',
      }))
    )
  }

  const alreadySigned = contract.status === 'signed'
  const shouldSyncPdf = Boolean(normalized.shouldFinalizeSignedContract) && !contract.doc_storage_path

  if (shouldSyncPdf) {
    try {
      await syncContractPdfFromZoho({
        contractId: contract.id,
        requestId,
      })

      if (locationIds.length > 0) {
        await supabaseAdmin.from('activity_log').insert(
          locationIds.map(locationId => ({
            location_id: locationId,
            type: 'contract',
            subject: 'Contract PDF archived',
            body: `Signed contract PDF synced from Zoho Sign.\nRequest ID: ${requestId}`,
            sent_by: 'system',
          }))
        )
      }
    } catch (e) {
      console.error('Failed to sync Zoho contract PDF:', e)
    }
  }

  if (normalized.shouldFinalizeSignedContract && !alreadySigned) {
    const completedAt = extractCompletedAt(payload, eventRequest) ?? new Date().toISOString()

    // Fetch field values from Zoho Sign
    let fields: Record<string, string> = {}
    try {
      fields = await getDocumentFields(requestId)
    } catch (e) {
      console.error('Failed to fetch Zoho Sign fields:', e)
    }

    const legalEntity =
      fields['legal_entity_name'] ?? fields['Business Name'] ?? fields['Company Name'] ?? null
    const stdRaw = laborRateFromSignedFields(fields)
    const warRaw = warrantyRateFromSignedFields(fields)
    const stdNum = stdRaw != null && stdRaw !== '' ? Number.parseFloat(String(stdRaw)) : NaN
    const warNum = warRaw != null && warRaw !== '' ? Number.parseFloat(String(warRaw)) : NaN
    const standardRate = Number.isFinite(stdNum) ? stdNum : null
    const warrantyRate = Number.isFinite(warNum) ? warNum : null

    await supabaseAdmin
      .from('contracts')
      .update({
        legal_entity_name: legalEntity,
        standard_labor_rate: standardRate,
        warranty_labor_rate: warrantyRate,
        signing_date: completedAt,
      })
      .eq('id', contract.id)

    if (locationIds.length > 0) {
      const automationLocal =
        process.env.RESEND_AUTOMATION_LOCAL_PART?.trim() || 'team'

      await supabaseAdmin
        .from('locations')
        .update({ status: 'contracted' })
        .in('id', locationIds)
        .in('status', ['lead', 'contacted', 'in_review'])

      for (const locationId of locationIds) {
        const { data: loc } = await supabaseAdmin
          .from('locations')
          .select('name, account_id')
          .eq('id', locationId)
          .single()

        const primary = await resolvePrimaryContact(
          supabaseAdmin,
          loc?.account_id ?? null,
          locationId,
        )

        await supabaseAdmin.from('activity_log').insert({
          location_id: locationId,
          type: 'contract',
          subject: 'Contract finalized details synced',
          body: `Request ID: ${requestId}. Signed as: ${legalEntity ?? 'unknown'}`,
          sent_by: 'system',
        })

        if (primary?.email) {
          const { subject, body } = renderTemplate('onboarding', {
            shop_name: loc?.name ?? 'your shop',
            contact_name: primary.name ?? 'there',
            sender_name: 'The RepairWise Team',
          })
          await resend.emails.send({
            from: notificationsFrom('RepairWise', automationLocal),
            to: primary.email,
            subject,
            text: body,
          })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
