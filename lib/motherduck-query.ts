import { DuckDBInstance, type DuckDBValue, type JS } from '@duckdb/node-api'

function duckdbHomeDirectory(): string {
  const explicit = process.env.DUCKDB_HOME_DIRECTORY?.trim()
  if (explicit) return explicit
  return process.env.HOME?.trim() || process.env.TMPDIR?.trim() || '/tmp'
}

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
      // Vercel / many serverless envs have no $HOME; DuckDB refuses to run without this.
      const home = duckdbHomeDirectory().replace(/'/g, "''")
      await connection.run(`SET home_directory = '${home}'`)
      const result = await connection.run(sql, params)
      return await result.getRowObjectsJS()
    } finally {
      connection.closeSync()
    }
  } finally {
    instance.closeSync()
  }
}
