-- Aggregate max activity timestamp per location for the pipeline list.
-- Excludes shop_created so "no touchpoints yet" falls back to locations.created_at in the app.
create or replace function public.pipeline_last_activity(p_location_ids uuid[])
returns table (location_id uuid, last_at timestamptz)
language sql
stable
as $$
  select al.location_id, max(al.created_at) as last_at
  from activity_log al
  where al.location_id = any(p_location_ids)
    and al.type is distinct from 'shop_created'
  group by al.location_id;
$$;

grant execute on function public.pipeline_last_activity(uuid[]) to service_role;
