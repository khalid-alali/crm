import { getMotherduckDsn } from '@/lib/motherduck-dsn'
import { queryMotherduckRows } from '@/lib/motherduck-query'

/**
 * Latest `status` from `my_db.shop_overrides` for a RepairWise admin shop id (UUID string).
 * Matches Vinfast app logic: newest row per `shop_id` by `rowid`.
 */
export async function getLatestShopOverrideStatus(shopId: string): Promise<string | null> {
  const dsn = getMotherduckDsn()
  const sql = `
    SELECT status
    FROM (
      SELECT status,
             ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY rowid DESC) AS rn
      FROM shop_overrides
      WHERE shop_id = $1
    ) ranked
    WHERE rn = 1
  `

  const rows = await queryMotherduckRows(dsn, sql, [shopId])
  const row = rows[0] as { status?: unknown } | undefined
  const status = row?.status
  if (typeof status === 'string' && status.trim()) return status
  return null
}
