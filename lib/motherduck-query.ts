import { DuckDBInstance, type DuckDBValue, type JS } from '@duckdb/node-api'

/**
 * Run a parameterized statement against a MotherDuck `md:` DSN using DuckDB 1.5.x
 * (`@duckdb/node-api`). Use `$1`, `$2`, … placeholders; pass values in order.
 */
export async function queryMotherduckRows(
  dsn: string,
  sql: string,
  params: DuckDBValue[] = [],
): Promise<Record<string, JS>[]> {
  const instance = await DuckDBInstance.create(dsn)
  try {
    const connection = await instance.connect()
    try {
      const result = await connection.run(sql, params)
      return await result.getRowObjectsJS()
    } finally {
      connection.closeSync()
    }
  } finally {
    instance.closeSync()
  }
}
