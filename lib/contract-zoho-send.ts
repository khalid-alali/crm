import { supabaseAdmin } from '@/lib/supabase'
import { createAndSendDocument } from '@/lib/zohosign'
import { buildZohoSignContractFieldTextData } from '@/lib/zoho-sign-contract-fields'
import { resolvePrimaryContact } from '@/lib/primary-contact'

export async function sendContractViaZoho(
  contractId: string,
  options: {
    fromShopDetail?: boolean
    sentBy: string
    /** Logged-in BDR — prefills “Head of Business Development” fields on the Zoho template. */
    bdContactName?: string | null
    bdContactEmail?: string | null
  }
): Promise<void> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('*, contract_locations(location_id)')
    .eq('id', contractId)
    .single()

  if (!contract) throw new Error('Contract not found')

  const cl = contract.contract_locations as { location_id: string }[] | undefined
  const locationId = cl?.[0]?.location_id ?? null
  const primary = await resolvePrimaryContact(
    supabaseAdmin,
    contract.account_id as string | null | undefined,
    locationId,
  )
  const recipientEmail = (contract.counterparty_email as string | null) ?? primary?.email ?? null
  const recipientName =
    (contract.counterparty_name as string | null) ?? primary?.name ?? primary?.email ?? 'Recipient'

  if (!recipientEmail) {
    throw new Error('No recipient email on contract or primary contact')
  }

  const bdName =
    options.bdContactName?.trim() ||
    process.env.ZOHO_SIGN_DEFAULT_BD_NAME?.trim() ||
    'RepairWise'
  const bdEmail =
    options.bdContactEmail?.trim() ||
    process.env.ZOHO_SIGN_DEFAULT_BD_EMAIL?.trim() ||
    ''
  if (!bdEmail || !bdEmail.includes('@')) {
    throw new Error(
      'Set ZOHO_SIGN_DEFAULT_BD_EMAIL or sign in with a Google account that has an email — required for Head of Business Development on the Zoho template'
    )
  }

  const fieldTextData = buildZohoSignContractFieldTextData({
    standardLaborRate: contract.standard_labor_rate,
    warrantyLaborRate: contract.warranty_labor_rate,
    shopOwnerName: recipientName,
    shopOwnerEmail: recipientEmail,
    headOfBusinessDevelopmentName: bdName,
    headOfBusinessDevelopmentEmail: bdEmail,
  })

  const requestName =
    process.env.ZOHO_SIGN_REQUEST_NAME?.trim() || 'RepairWise Shop Agreement'

  const { requestId } = await createAndSendDocument({
    templateId: process.env.ZOHO_SIGN_TEMPLATE_ID!,
    recipientName,
    recipientEmail,
    requestName,
    fieldTextData,
  })

  const { data: updatedRow, error: persistErr } = await supabaseAdmin
    .from('contracts')
    .update({
      zoho_sign_request_id: requestId,
      status: 'sent',
      zoho_sent_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select('id')
    .maybeSingle()

  if (persistErr) {
    throw new Error(`Failed to save contract after Zoho send: ${persistErr.message}`)
  }
  if (!updatedRow) {
    throw new Error('Failed to save contract after Zoho send: no matching contract row was updated')
  }

  const { data: contractLocations } = await supabaseAdmin
    .from('contract_locations')
    .select('location_id')
    .eq('contract_id', contractId)

  const activityContractBody =
    `Sent to ${recipientEmail}` +
    (options.fromShopDetail ? '\n\n— Sent from shop detail (Send contract)' : '')

  for (const cl of contractLocations ?? []) {
    await supabaseAdmin.from('activity_log').insert({
      location_id: cl.location_id,
      type: 'contract',
      subject: 'Contract sent via Zoho Sign',
      body: activityContractBody,
      sent_by: options.sentBy,
    })
  }
}
