import { supabaseAdmin } from '@/lib/supabase'
import {
  getSigningRequestSummary,
  recallSigningRequest,
  signerRecipientActionIds,
  submitSigningRequestIfNotAlreadySubmitted,
  updateSigningRequestSignerRecipients,
} from '@/lib/zohosign'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Recall → PUT update signer on the same Zoho request → optional POST /submit if Zoho did not auto-send
 * (submit is skipped when Zoho returns 12008 “already submitted”, which happens after PUT re-sends).
 * Then persist recipient on the contract row.
 */
export async function reviseSentContractRecipient(
  contractId: string,
  options: {
    recipientName: string
    recipientEmail: string
    sentBy: string
    fromShopDetail?: boolean
  }
): Promise<void> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, status, zoho_sign_request_id')
    .eq('id', contractId)
    .single()

  if (!contract) throw new Error('Contract not found')
  if (contract.status !== 'sent') {
    throw new Error('Only contracts in Sent status can be revised this way')
  }

  const requestId = typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
  if (!requestId) throw new Error('No Zoho Sign request on this contract')

  const { requestName, actions } = await getSigningRequestSummary(requestId)
  const signerActionIds = signerRecipientActionIds(actions)
  if (!signerActionIds.length) {
    throw new Error('Could not determine signer action on this Zoho request')
  }

  await recallSigningRequest(requestId)
  await sleep(400)

  await updateSigningRequestSignerRecipients({
    requestId,
    requestName,
    signerActionIds,
    recipientName: options.recipientName.trim(),
    recipientEmail: options.recipientEmail.trim(),
  })

  // PUT often re-sends the envelope; POST /submit then returns 12008 "already submitted" — treat as OK.
  await submitSigningRequestIfNotAlreadySubmitted(requestId)

  const { error: upErr } = await supabaseAdmin
    .from('contracts')
    .update({
      counterparty_name: options.recipientName.trim(),
      counterparty_email: options.recipientEmail.trim(),
      status: 'sent',
      zoho_sent_at: new Date().toISOString(),
    })
    .eq('id', contractId)

  if (upErr) throw new Error(upErr.message)

  const { data: contractLocations } = await supabaseAdmin
    .from('contract_locations')
    .select('location_id')
    .eq('contract_id', contractId)

  const activityBody =
    `Recipient set to ${options.recipientEmail.trim()} (${options.recipientName.trim()})` +
    (options.fromShopDetail ? '\n\n— Revise & resubmit from shop detail (Contracts tab)' : '')

  for (const cl of contractLocations ?? []) {
    await supabaseAdmin.from('activity_log').insert({
      location_id: cl.location_id,
      type: 'contract',
      subject: 'Contract signer updated & resent (Zoho Sign)',
      body: activityBody,
      sent_by: options.sentBy,
    })
  }
}
