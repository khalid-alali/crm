import { getMotherduckLakeDsn } from '@/lib/motherduck-dsn'
import { queryMotherduckRows } from '@/lib/motherduck-query'

/** Same shape as `AdminSearchResult` in shop detail (MotherDuck has no CRM `id`). */
export type MotherduckAdminShopSearchRow = {
  id: string
  name: string
  status: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  motherduck_shop_id: string
  primary_contact_email: string | null
  account_primary_name: string | null
  account_primary_email: string | null
}

function sanitizeIdentifier(raw: string | undefined, fallback: string): string {
  const s = (raw ?? fallback).trim()
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) ? s : fallback
}

function mapIsActive(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'active' : 'inactive'
  if (typeof v === 'number') return v !== 0 ? 'active' : 'inactive'
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim()
    if (['true', 't', '1', 'yes', 'active'].includes(s)) return 'active'
    if (['false', 'f', '0', 'no', 'inactive'].includes(s)) return 'inactive'
  }
  return 'inactive'
}

function clean(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

/** Strip LIKE metacharacters; user string is embedded in a single bound pattern. */
function likeNeedle(raw: string): string {
  return raw.trim().slice(0, 120).replace(/[%_\\]/g, '')
}

function rankRows(rows: MotherduckAdminShopSearchRow[], needle: string): MotherduckAdminShopSearchRow[] {
  return rows
    .map(row => {
      const fields = [
        row.name,
        row.address_line1,
        row.city,
        row.state,
        row.postal_code,
        row.primary_contact_email,
        row.motherduck_shop_id,
      ]
      const hay = fields.map(clean)
      let score = 0
      for (const field of hay) {
        if (!field) continue
        if (field === needle) score += 100
        else if (field.startsWith(needle)) score += 60
        else if (field.includes(needle)) score += 30
      }
      return { score: Math.max(score, 1), row }
    })
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, 'en', { sensitivity: 'base' }))
    .slice(0, 20)
    .map(item => item.row)
}

type SqlRow = {
  motherduck_shop_id?: unknown
  name?: unknown
  address_line1?: unknown
  city?: unknown
  state?: unknown
  postal_code?: unknown
  primary_contact_email?: unknown
  is_active?: unknown
}

/**
 * Search RepairWise admin shops in MotherDuck lake `repairwise_lake`:
 * `Shop` (`id`, camelCase `addressId`) LEFT JOIN `Address` (`id`, `line1`, `city`, `state`, `zip`).
 *
 * Env (optional overrides):
 * - `MOTHERDUCK_TOKEN` (required)
 * - `MOTHERDUCK_LAKE_DATABASE` (default `repairwise_lake`)
 * - `MOTHERDUCK_SHOP_TABLE` (default `Shop`)
 * - `MOTHERDUCK_ADDRESS_TABLE` (default `Address`)
 * - `MOTHERDUCK_SHOP_ADDRESS_JOIN` — `addressId` (default): `Address.id = Shop.addressId`;
 *   or `shopId`: `Address.shopId = Shop.id` if your Address rows carry `shopId`
 */
export async function searchMotherduckAdminShops(q: string): Promise<MotherduckAdminShopSearchRow[]> {
  const needle = likeNeedle(q)
  if (needle.length < 2) return []
  const needleLc = clean(needle)
  const pat = `%${needle}%`

  const shopTable = sanitizeIdentifier(process.env.MOTHERDUCK_SHOP_TABLE, 'Shop')
  const addressTable = sanitizeIdentifier(process.env.MOTHERDUCK_ADDRESS_TABLE, 'Address')
  const joinMode = (process.env.MOTHERDUCK_SHOP_ADDRESS_JOIN ?? 'addressId').trim().toLowerCase()
  const addressJoinSql =
    joinMode === 'shopid' || joinMode === 'shop_id'
      ? `CAST(addr."shopId" AS VARCHAR) = CAST(s.id AS VARCHAR)`
      : `CAST(addr.id AS VARCHAR) = CAST(s."addressId" AS VARCHAR)`

  const dsn = getMotherduckLakeDsn()

  const sql = `
    SELECT
      CAST(s.id AS VARCHAR) AS motherduck_shop_id,
      CAST(s.name AS VARCHAR) AS name,
      CAST(COALESCE(addr.line1, '') AS VARCHAR) AS address_line1,
      CAST(addr.city AS VARCHAR) AS city,
      CAST(addr.state AS VARCHAR) AS state,
      CAST(COALESCE(addr.zip, '') AS VARCHAR) AS postal_code,
      CAST('' AS VARCHAR) AS primary_contact_email,
      TRUE AS is_active
    FROM "${shopTable}" s
    LEFT JOIN "${addressTable}" addr ON ${addressJoinSql}
    WHERE regexp_full_match(
        CAST(s.id AS VARCHAR),
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      )
      AND concat_ws(' ',
        CAST(s.id AS VARCHAR),
        CAST(COALESCE(s.name, '') AS VARCHAR),
        CAST(COALESCE(addr.line1, '') AS VARCHAR),
        CAST(COALESCE(addr.city, '') AS VARCHAR),
        CAST(COALESCE(addr.state, '') AS VARCHAR),
        CAST(COALESCE(addr.zip, '') AS VARCHAR)
      ) ILIKE $1
    ORDER BY s.name NULLS LAST
    LIMIT 200
  `

  const rows = (await queryMotherduckRows(dsn, sql, [pat])) as SqlRow[]

  const mapped: MotherduckAdminShopSearchRow[] = rows.map(r => {
    const motherduck_shop_id = String(r.motherduck_shop_id ?? '').trim()
    const name = String(r.name ?? '').trim() || '—'
    return {
      id: motherduck_shop_id,
      motherduck_shop_id,
      name,
      status: mapIsActive(r.is_active),
      address_line1: (r.address_line1 != null && String(r.address_line1).trim()) ? String(r.address_line1).trim() : null,
      city: (r.city != null && String(r.city).trim()) ? String(r.city).trim() : null,
      state: (r.state != null && String(r.state).trim()) ? String(r.state).trim() : null,
      postal_code: (r.postal_code != null && String(r.postal_code).trim()) ? String(r.postal_code).trim() : null,
      primary_contact_email:
        r.primary_contact_email != null && String(r.primary_contact_email).trim()
          ? String(r.primary_contact_email).trim()
          : null,
      account_primary_name: null,
      account_primary_email: null,
    }
  })

  return rankRows(mapped, needleLc)
}
