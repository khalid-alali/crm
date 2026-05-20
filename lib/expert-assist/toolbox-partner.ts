import { supabaseAdmin } from '@/lib/supabase'

/** Shop name → referral base: remove spaces, strip non-alphanumeric, uppercase (e.g. "Oil Changers" → "OILCHANGERS"). */
export function shopNameToToolboxPartnerBase(shopName: string): string {
  return shopName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

export function toolboxPartnerSuffixFromLocationId(locationId: string): string {
  return locationId.replace(/-/g, '').slice(-4).toUpperCase()
}

/** If base is taken by another location, append last 4 chars of location id. */
export function computeToolboxCasePartner(
  shopName: string,
  locationId: string,
  baseTakenByOther: boolean,
): string {
  const base = shopNameToToolboxPartnerBase(shopName) || 'SHOP'
  if (!baseTakenByOther) return base
  return `${base}${toolboxPartnerSuffixFromLocationId(locationId)}`
}

async function isPartnerCodeTakenByOther(code: string, locationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('toolbox_case_partner', code)
    .neq('id', locationId)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Derives Toolbox casePartner from shop name, persists on locations.toolbox_case_partner.
 * Re-runs when shop name changes so the referral code stays in sync.
 */
export async function ensureToolboxCasePartner(locationId: string, shopName: string): Promise<string> {
  const base = shopNameToToolboxPartnerBase(shopName) || 'SHOP'
  const baseTaken = await isPartnerCodeTakenByOther(base, locationId)
  const code = computeToolboxCasePartner(shopName, locationId, baseTaken)

  const { data: loc } = await supabaseAdmin
    .from('locations')
    .select('toolbox_case_partner')
    .eq('id', locationId)
    .maybeSingle()

  if (loc?.toolbox_case_partner === code) return code

  const { error } = await supabaseAdmin
    .from('locations')
    .update({ toolbox_case_partner: code })
    .eq('id', locationId)

  if (error) throw new Error(error.message)
  return code
}
