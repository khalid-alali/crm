-- Bundle analytics for internal /analytics page (single RPC → jsonb).

create or replace function public.analytics_dashboard(p_since timestamptz)
returns jsonb
language sql
stable
as $$
with loc_cohort as (
  select l.id, l.status, l.created_at, l.chain_name, l.source
  from locations l
  where p_since is null or l.created_at >= p_since
),
pipeline as (
  select status, count(*)::int as cnt
  from loc_cohort
  group by status
),
kpi as (
  select
    (select count(*)::int from loc_cohort) as total_shops,
    (select count(*)::int from loc_cohort where status = 'active') as active,
    (
      select count(*)::int
      from contracts c
      where c.status = 'signed'
        and c.signing_date is not null
        and (p_since is null or c.signing_date >= p_since)
    ) as contracts_signed,
    (
      select round(avg(extract(epoch from (s.first_sign - s.created_at)) / 86400)::numeric, 1)
      from (
        select l.created_at, min(c.signing_date) as first_sign
        from loc_cohort l
        join contract_locations cl on cl.location_id = l.id
        join contracts c
          on c.id = cl.contract_id
          and c.status = 'signed'
          and c.signing_date is not null
        group by l.id, l.created_at
      ) s
    ) as avg_days_to_sign,
    (
      select count(*)::int
      from locations l
      where l.status = 'inactive'
        and l.updated_at >= (now() - interval '30 days')
    ) as churn_30d
),
contracts_by_month as (
  select
    date_trunc('month', c.signing_date) as month,
    count(*)::int as cnt
  from contracts c
  where c.status = 'signed'
    and c.signing_date is not null
    and (p_since is null or c.signing_date >= p_since)
  group by 1
  order by 1
),
program_flags as (
  select
    l.id,
    exists (
      select 1
      from program_enrollments pe
      where pe.location_id = l.id
        and pe.status = 'active'
        and pe.program in ('multi_drive', 'ev_program')
    ) as has_md,
    exists (
      select 1
      from program_enrollments pe
      where pe.location_id = l.id
        and pe.status = 'active'
        and pe.program = 'oem_warranty'
    ) as has_oem
  from loc_cohort l
),
program_mix as (
  select
    count(*) filter (where has_md and not has_oem)::int as md_only,
    count(*) filter (where has_oem and not has_md)::int as oem_only,
    count(*) filter (where has_md and has_oem)::int as both_mix,
    count(*) filter (where not has_md and not has_oem)::int as neither
  from program_flags
),
lead_sources as (
  select
    coalesce(nullif(trim(source), ''), 'unknown') as src,
    count(*)::int as cnt
  from loc_cohort
  group by 1
  order by cnt desc
),
chains_top as (
  select
    chain_name,
    count(*)::int as total,
    count(*) filter (where status = 'active')::int as active
  from loc_cohort
  where chain_name is not null
    and trim(chain_name) <> ''
  group by chain_name
  order by count(*) desc
  limit 10
),
activity_by_type as (
  select al.type, count(*)::int as cnt
  from activity_log al
  where p_since is null or al.created_at >= p_since
  group by al.type
  order by cnt desc
),
activity_daily as (
  select
    (date_trunc('day', al.created_at))::date as day,
    count(*)::int as cnt
  from activity_log al
  where p_since is null or al.created_at >= p_since
  group by 1
  order by 1
)
select jsonb_build_object(
  'kpi',
  (select jsonb_build_object(
    'total_shops', k.total_shops,
    'active', k.active,
    'contracts_signed', k.contracts_signed,
    'avg_days_to_sign', k.avg_days_to_sign,
    'churn_30d', k.churn_30d
  ) from kpi k),
  'pipeline_by_status',
  coalesce(
    (select jsonb_agg(jsonb_build_object('status', p.status, 'count', p.cnt) order by p.status) from pipeline p),
    '[]'::jsonb
  ),
  'contracts_by_month',
  coalesce(
    (select jsonb_agg(jsonb_build_object('month', m.month, 'count', m.cnt) order by m.month) from contracts_by_month m),
    '[]'::jsonb
  ),
  'program_mix',
  (select jsonb_build_array(
    jsonb_build_object('segment', 'MD only', 'count', pm.md_only),
    jsonb_build_object('segment', 'OEM only', 'count', pm.oem_only),
    jsonb_build_object('segment', 'Both', 'count', pm.both_mix),
    jsonb_build_object('segment', 'None', 'count', pm.neither)
  ) from program_mix pm),
  'lead_sources',
  coalesce(
    (select jsonb_agg(jsonb_build_object('source', ls.src, 'count', ls.cnt) order by ls.cnt desc) from lead_sources ls),
    '[]'::jsonb
  ),
  'chains_top',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'chain_name', c.chain_name,
          'total', c.total,
          'active', c.active,
          'activation_pct',
          case
            when c.total > 0 then round((100.0 * c.active / c.total)::numeric, 0)::int
            else 0
          end
        )
        order by c.total desc
      )
      from chains_top c
    ),
    '[]'::jsonb
  ),
  'activity_by_type',
  coalesce(
    (select jsonb_agg(jsonb_build_object('type', a.type, 'count', a.cnt) order by a.cnt desc) from activity_by_type a),
    '[]'::jsonb
  ),
  'activity_daily',
  coalesce(
    (select jsonb_agg(jsonb_build_object('day', a.day, 'count', a.cnt) order by a.day) from activity_daily a),
    '[]'::jsonb
  )
);
$$;

comment on function public.analytics_dashboard(timestamptz) is
  'Aggregated CRM analytics for the internal dashboard. p_since filters location cohort (created_at) and activity; contract KPIs/monthly use signing_date. churn_30d is rolling last 30 days.';

grant execute on function public.analytics_dashboard(timestamptz) to service_role;
