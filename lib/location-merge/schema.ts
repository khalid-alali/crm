import type { SupabaseClient } from '@supabase/supabase-js'
import { LOCATION_MERGE_SYSTEM_COLUMNS } from '@/lib/locations-active'
import type { MergeColumnMeta } from '@/lib/location-merge/types'

const CHECKLIST_ITEM_FIELDS = ['completed_at', 'completed_by_user_id', 'notes'] as const

export async function fetchMergeableColumns(
  supabase: SupabaseClient,
  tableName: string,
  extraExcluded: string[] = [],
): Promise<MergeColumnMeta[]> {
  const excluded = [...LOCATION_MERGE_SYSTEM_COLUMNS, ...extraExcluded]
  const { data, error } = await supabase.rpc('get_mergeable_columns', {
    p_table_name: tableName,
    p_excluded_names: excluded,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as MergeColumnMeta[]
}

/** Checklist rows are keyed by item_key; merge these attribute columns. */
export function checklistItemFieldColumns(): MergeColumnMeta[] {
  return CHECKLIST_ITEM_FIELDS.map(name => ({
    column_name: name,
    data_type: name === 'notes' ? 'text' : 'text',
    udt_name: name === 'completed_at' ? 'timestamptz' : 'text',
    is_nullable: 'YES',
    character_maximum_length: null,
  }))
}
