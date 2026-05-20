import type { SupabaseClient } from '@supabase/supabase-js'

export const LOCATIONS_TABLE = 'locations' as const

/** System columns excluded from merge field logic (see location_merge_scope.md). */
export const LOCATION_MERGE_SYSTEM_COLUMNS = [
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'merged_into',
] as const

type SelectOptions = {
  count?: 'exact' | 'planned' | 'estimated'
  head?: boolean
}

/**
 * Default read path for locations in UI (pipeline, map, search, programs, accounts).
 * Excludes soft-deleted rows from location merges.
 *
 * @example
 * activeLocations(supabaseAdmin, 'id, name').eq('status', 'active').order('name')
 */
export function activeLocations(
  client: SupabaseClient,
  columns: string,
  options?: SelectOptions,
) {
  // `deleted_at` is added in migration 048; Supabase generated types may not include it yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- preserve select() inference
  return (client.from(LOCATIONS_TABLE).select(columns, options) as any).is('deleted_at', null)
}

/**
 * Full `locations` table — load/update by id, including merged rows (redirects, merge, portal).
 *
 * @example
 * locationsTable(supabaseAdmin).select('*').eq('id', shopId).single()
 */
export function locationsTable(client: SupabaseClient) {
  return client.from(LOCATIONS_TABLE)
}

/** @deprecated Use `activeLocations(client, columns)` — filter must come after `.select()`. */
export function onlyActiveLocations<Q extends { is(column: string, value: null): Q }>(query: Q): Q {
  return query.is('deleted_at', null) as Q
}
