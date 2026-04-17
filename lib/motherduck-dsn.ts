/** MotherDuck database name (default `my_db`). */
export function getMotherduckDatabaseName(): string {
  const s = (process.env.MOTHERDUCK_DATABASE ?? 'my_db').trim()
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s) ? s : 'my_db'
}

/** RepairWise data lake DB on MotherDuck (admin shop search). */
export function getMotherduckLakeDatabaseName(): string {
  const s = (process.env.MOTHERDUCK_LAKE_DATABASE ?? 'repairwise_lake').trim()
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s) ? s : 'repairwise_lake'
}

/** `md:` connection string for DuckDB against MotherDuck. */
export function getMotherduckDsn(): string {
  const token = process.env.MOTHERDUCK_TOKEN?.trim()
  if (!token) throw new Error('MOTHERDUCK_TOKEN is not set')
  return `md:${getMotherduckDatabaseName()}?motherduck_token=${encodeURIComponent(token)}`
}

/** `md:` DSN for the RepairWise lake (shop + address search). */
export function getMotherduckLakeDsn(): string {
  const token = process.env.MOTHERDUCK_TOKEN?.trim()
  if (!token) throw new Error('MOTHERDUCK_TOKEN is not set')
  return `md:${getMotherduckLakeDatabaseName()}?motherduck_token=${encodeURIComponent(token)}`
}
