export const SHOP_BUSINESS_TYPES = ['repair_shop', 'body_shop'] as const
export type ShopBusinessType = (typeof SHOP_BUSINESS_TYPES)[number]

const ALLOWED = new Set<string>(SHOP_BUSINESS_TYPES)

export function isShopBusinessType(v: string): v is ShopBusinessType {
  return ALLOWED.has(v)
}

/** Sorted unique subset of allowed values, or null if empty after normalize. */
export function normalizeShopBusinessTypesList(values: string[]): ShopBusinessType[] | null {
  const r = tryNormalizeShopBusinessTypesList(values)
  return r.ok ? r.value : null
}

export function tryNormalizeShopBusinessTypesList(
  values: string[],
): { ok: true; value: ShopBusinessType[] | null } | { ok: false } {
  const out = new Set<ShopBusinessType>()
  for (const raw of values) {
    const s = String(raw).trim()
    if (!s) continue
    if (!isShopBusinessType(s)) return { ok: false }
    out.add(s)
  }
  if (out.size === 0) return { ok: true, value: null }
  return { ok: true, value: [...out].sort() as ShopBusinessType[] }
}

/**
 * Parse API body: null clears; undefined means omit; arrays are validated.
 * Returns `undefined` if the field was not sent; `false` if invalid member.
 */
export function parseShopBusinessTypesField(
  raw: unknown,
): ShopBusinessType[] | null | undefined | false {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (!Array.isArray(raw)) return false
  const r = tryNormalizeShopBusinessTypesList(raw.map(String))
  return r.ok ? r.value : false
}

const BULK_TYPE_ALIASES: Record<string, string> = {
  'repair shop': 'REPAIR SHOP',
  'repair_shop': 'REPAIR SHOP',
  bodyshop: 'BODYSHOP',
  'body shop': 'BODYSHOP',
  specialist: 'SPECIALIST',
}

export type BulkImportTypeParse = {
  /** Normalized uppercase type token, or null if blank */
  rawNormalized: string | null
  /** repair_shop / body_shop for CRM column */
  shop_business_types: ShopBusinessType[] | null
  /** generalist / specialist when inferable from bulk "SPECIALIST" */
  shop_type: 'generalist' | 'specialist' | null
  warnings: string[]
  errors: string[]
}

/**
 * Map legacy bulk CSV "Type" column to `shop_business_types` + optional `shop_type`.
 * Unknown non-empty values produce errors.
 */
export function parseBulkImportTypeColumn(raw: string | undefined | null): BulkImportTypeParse {
  const warnings: string[] = []
  const errors: string[] = []
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return {
      rawNormalized: null,
      shop_business_types: null,
      shop_type: null,
      warnings: [],
      errors: [],
    }
  }

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ')
  const upper = (BULK_TYPE_ALIASES[key] ?? trimmed).toUpperCase().replace(/\s+/g, ' ').trim()

  if (upper === 'REPAIR SHOP') {
    return {
      rawNormalized: upper,
      shop_business_types: ['repair_shop'],
      shop_type: null,
      warnings,
      errors,
    }
  }
  if (upper === 'BODYSHOP' || upper === 'BODY SHOP') {
    return {
      rawNormalized: 'BODYSHOP',
      shop_business_types: ['body_shop'],
      shop_type: null,
      warnings,
      errors,
    }
  }
  if (upper === 'SPECIALIST') {
    warnings.push('SPECIALIST → shop_type=specialist; add repair_shop/body_shop manually if needed')
    return {
      rawNormalized: upper,
      shop_business_types: null,
      shop_type: 'specialist',
      warnings,
      errors,
    }
  }

  errors.push(`Unknown Type "${trimmed}" — expected REPAIR SHOP, BODYSHOP, SPECIALIST, or empty`)
  return {
    rawNormalized: upper,
    shop_business_types: null,
    shop_type: null,
    warnings,
    errors,
  }
}
