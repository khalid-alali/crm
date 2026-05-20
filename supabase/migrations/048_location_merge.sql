-- Location merge: soft-delete merged duplicates and introspect mergeable columns.

alter table public.locations
  add column if not exists merged_into uuid references public.locations(id),
  add column if not exists deleted_at timestamptz;

create index if not exists idx_locations_merged_into
  on public.locations (merged_into)
  where merged_into is not null;

create index if not exists idx_locations_active
  on public.locations (id)
  where deleted_at is null;

comment on column public.locations.merged_into is 'Surviving location id when this row was merged away.';
comment on column public.locations.deleted_at is 'Soft-delete timestamp (merge or future archival).';

-- Returns public table columns for schema-driven merge (excludes caller-provided names).
create or replace function public.get_mergeable_columns(
  p_table_name text,
  p_excluded_names text[] default array[]::text[]
)
returns table (
  column_name text,
  data_type text,
  udt_name text,
  is_nullable text,
  character_maximum_length integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text,
    c.is_nullable::text,
    c.character_maximum_length::integer
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table_name
    and c.column_name <> all (
      coalesce(p_excluded_names, array[]::text[])
      || array['id', 'created_at', 'updated_at', 'deleted_at', 'merged_into']
    )
  order by c.ordinal_position;
$$;

grant execute on function public.get_mergeable_columns(text, text[]) to service_role;
