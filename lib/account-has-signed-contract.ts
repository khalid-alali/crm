import type { SupabaseClient } from '@supabase/supabase-js'

/** True when the account has at least one contract with status `signed`. */
export async function accountHasSignedContract(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id')
    .eq('account_id', accountId)
    .eq('status', 'signed')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/** Initial pipeline status for new locations on this account (`contracted` displays as Signed). */
export function initialLocationStatusForAccount(hasSignedContract: boolean): 'lead' | 'contracted' {
  return hasSignedContract ? 'contracted' : 'lead'
}
