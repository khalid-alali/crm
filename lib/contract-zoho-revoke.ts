import { supabaseAdmin } from '@/lib/supabase'
import { recallSigningRequest } from '@/lib/zohosign'

/**
 * Recall the envelope in Zoho Sign (their “revoke”) and mark the contract revoked in the CRM.
 * User sends a fresh agreement afterward via “Send new contract”.
 */
export async function revokeContractInZoho(
  contractId: string,
  options: { revokedBy: string; fromShopDetail?: boolean },
): Promise<void> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, status, zoho_sign_request_id')
    .eq('id', contractId)
    .single()

  if (!contract) throw new Error('Contract not found')
  if (contract.status !== 'sent' && contract.status !== 'viewed') {
    throw new Error('Only sent or in-progress contracts can be revoked')
  }

  const requestId = typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
  if (!requestId) throw new Error('No Zoho Sign request on this contract')

  await recallSigningRequest(requestId)

  const { error: upErr } = await supabaseAdmin.from('contracts').update({ status: 'revoked' }).eq('id', contractId)

  if (upErr) throw new Error(upErr.message)

  const { data: contractLocations } = await supabaseAdmin
    .from('contract_locations')
    .select('location_id')
    .eq('contract_id', contractId)

  const body =
    'The Zoho Sign request was recalled (revoked). Send a new contract from the shop when ready.' +
    (options.fromShopDetail ? '\n\n— Revoked from shop detail (Contracts tab)' : '')

  for (const cl of contractLocations ?? []) {
    await supabaseAdmin.from('activity_log').insert({
      location_id: cl.location_id,
      type: 'contract',
      subject: 'Contract revoked (Zoho Sign)',
      body,
      sent_by: options.revokedBy,
    })
  }
}
