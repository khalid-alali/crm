import { detectChain } from '@/lib/chain-detect'
import { normalizeShopShortCode } from '@/lib/expert-assist/phone'
import { supabaseAdmin } from '@/lib/supabase'

const MIN_LEN = 4
const MAX_LEN = 12

export function validateShortCodeFormat(code: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  const normalized = normalizeShopShortCode(code)
  if (!normalized) return { ok: false, reason: 'Enter a shop code' }
  if (normalized.length < MIN_LEN) return { ok: false, reason: `Use at least ${MIN_LEN} characters` }
  if (normalized.length > MAX_LEN) return { ok: false, reason: `Use at most ${MAX_LEN} characters` }
  return { ok: true, normalized }
}

/** Heuristic suggestion from shop name + optional city (mockup SUGGEST). */
export function suggestShortCode(shopName: string, city?: string | null): string {
  const chain = detectChain(shopName)
  const words = shopName
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  let base = ''
  if (chain) {
    const chainKey = normalizeShopShortCode(chain)
    const cityKey = city ? normalizeShopShortCode(city).slice(0, 4) : ''
    base = (chainKey + cityKey).slice(0, MAX_LEN)
  } else if (words.length) {
    base = normalizeShopShortCode(words[0]!)
  }

  if (!base || base.length < MIN_LEN) {
    base = normalizeShopShortCode(words.join('')).slice(0, MAX_LEN)
  }
  if (base.length < MIN_LEN && city) {
    base = normalizeShopShortCode(`${words[0] ?? ''}${city}`).slice(0, MAX_LEN)
  }
  return base.slice(0, MAX_LEN) || 'SHOP'
}

export async function isShortCodeAvailable(
  code: string,
  excludeLocationId: string,
): Promise<{ available: boolean; normalized: string; reason?: string }> {
  const fmt = validateShortCodeFormat(code)
  if (!fmt.ok) return { available: false, normalized: normalizeShopShortCode(code), reason: fmt.reason }

  const { data } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('consult_short_code', fmt.normalized)
    .neq('id', excludeLocationId)
    .maybeSingle()

  if (data) return { available: false, normalized: fmt.normalized, reason: 'This code is already in use' }
  return { available: true, normalized: fmt.normalized }
}
