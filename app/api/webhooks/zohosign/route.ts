import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyWebhookToken, getDocumentFields } from '@/lib/zohosign'
import { Resend } from 'resend'
import { renderTemplate } from '@/lib/email-templates'
import { notificationsFrom } from '@/lib/resend-notifications'
import { laborRateFromSignedFields, warrantyRateFromSignedFields } from '@/lib/zoho-sign-contract-fields'

const resend = new Resend(process.env.RESEND_API_KEY)

// Zoho Sign sends a token query param or header for verification
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-zoho-webhook-token') ?? ''

  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const payload = await req.json()
  const { requests: eventRequest } = payload

  if (!eventRequest) return NextResponse.json({ ok: true })

  const requestId: string = eventRequest.request_id
  const requestStatus: string = eventRequest.request_status // 'completed' | 'recalled' | 'expired'
  const actionStatus: string = eventRequest.actions?.[0]?.action_status ?? ''

  // Map Zoho Sign status to our enum
  let contractStatus: string | null = null
  if (requestStatus === 'completed') contractStatus = 'signed'
  else if (requestStatus === 'recalled') contractStatus = 'declined'
  else if (actionStatus === 'VIEWED') contractStatus = 'viewed'

  if (!contractStatus) return NextResponse.json({ ok: true })

  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, owner_id')
    .eq('zoho_sign_request_id', requestId)
    .single()

  if (!contract) {
    console.warn(`[zohosign webhook] No contract with zoho_sign_request_id=${requestId} — send may not have persisted the Zoho request id, or the row was created outside the app. Run: npm run reconcile:zoho`)
    return NextResponse.json({ ok: true })
  }

  await supabaseAdmin
    .from('contracts')
    .update({ status: contractStatus })
    .eq('id', contract.id)

  if (contractStatus === 'signed') {
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
        signing_date: new Date().toISOString(),
      })
      .eq('id', contract.id)

    // Update linked locations to 'contracted'
    const { data: contractLocations } = await supabaseAdmin
      .from('contract_locations')
      .select('location_id')
      .eq('contract_id', contract.id)

    const locationIds = contractLocations?.map(cl => cl.location_id) ?? []

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
          .select('name, primary_contact_email, primary_contact_name')
          .eq('id', locationId)
          .single()

        await supabaseAdmin.from('activity_log').insert({
          location_id: locationId,
          type: 'contract',
          subject: 'Contract signed via Zoho Sign',
          body: `Request ID: ${requestId}. Signed as: ${legalEntity ?? 'unknown'}`,
          sent_by: 'system',
        })

        if (loc?.primary_contact_email) {
          const { subject, body } = renderTemplate('onboarding', {
            shop_name: loc.name,
            contact_name: loc.primary_contact_name ?? 'there',
            sender_name: 'The RepairWise Team',
          })
          await resend.emails.send({
            from: notificationsFrom('RepairWise', automationLocal),
            to: loc.primary_contact_email,
            subject,
            text: body,
          })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
