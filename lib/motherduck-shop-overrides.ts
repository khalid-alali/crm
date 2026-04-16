import duckdb from 'duckdb'

/**
 * Latest `status` from `my_db.shop_overrides` for a RepairWise admin shop id (UUID string).
 * Matches Vinfast app logic: newest row per `shop_id` by `rowid`.
 */
export async function getLatestShopOverrideStatus(shopId: string): Promise<string | null> {
  const token = process.env.MOTHERDUCK_TOKEN?.trim()
  if (!token) throw new Error('MOTHERDUCK_TOKEN is not set')

  const dsn = `md:my_db?motherduck_token=${encodeURIComponent(token)}`
  const sql = `
    SELECT status
    FROM (
      SELECT status,
             ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY rowid DESC) AS rn
      FROM shop_overrides
      WHERE shop_id = ?
    ) ranked
    WHERE rn = 1
  `

  return new Promise((resolve, reject) => {
    let db: duckdb.Database | null = null
    try {
      db = new duckdb.Database(dsn)
    } catch (e) {
      reject(e)
      return
    }

    const conn = db.connect()
    conn.all(sql, shopId, (err, rows) => {
      conn.close(() => {
        db?.close(() => {
          if (err) {
            reject(err)
            return
          }
          const row = rows?.[0] as { status?: unknown } | undefined
          const status = row?.status
          if (typeof status === 'string' && status.trim()) resolve(status)
          else resolve(null)
        })
      })
    })
  })
}
