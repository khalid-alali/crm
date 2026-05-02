-- Pipeline status `dormant`: stale outreach before Churned (`inactive`).

alter table locations
  drop constraint if exists locations_status_check;

alter table locations
  add constraint locations_status_check
  check (status in (
    'lead',
    'contacted',
    'dormant',
    'in_review',
    'contracted',
    'active',
    'inactive'
  ));

-- Treat dormant like other early stages when a contract is signed.
create or replace function sync_locations_for_signed_contract(p_contract_id uuid)
returns void
language plpgsql
as $$
begin
  update locations l
  set status = 'contracted', updated_at = now()
  from contract_locations cl
  where cl.contract_id = p_contract_id
    and cl.location_id = l.id
    and l.status in ('lead', 'contacted', 'dormant', 'in_review');
end;
$$;

create or replace function trg_contract_locations_link_signed_contract()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from contracts c where c.id = new.contract_id and c.status = 'signed') then
    update locations l
    set status = 'contracted', updated_at = now()
    where l.id = new.location_id
      and l.status in ('lead', 'contacted', 'dormant', 'in_review');
  end if;
  return new;
end;
$$;

-- One-time backfill: signed contract but still early pipeline (include dormant).
update locations l
set status = 'contracted', updated_at = now()
where l.status in ('lead', 'contacted', 'dormant', 'in_review')
  and exists (
    select 1
    from contract_locations cl
    join contracts c on c.id = cl.contract_id
    where cl.location_id = l.id
      and c.status = 'signed'
  );

-- Optional: mark stale contacted shops (run manually in SQL editor when ready).
-- with last_touch as (
--   select
--     l.id,
--     coalesce(
--       max(al.created_at) filter (where al.type is distinct from 'shop_created'),
--       l.created_at
--     ) as last_at
--   from locations l
--   left join activity_log al on al.location_id = l.id
--   where l.status = 'contacted'
--   group by l.id, l.created_at
-- )
-- update locations l
-- set status = 'dormant', updated_at = now()
-- from last_touch t
-- where l.id = t.id
--   and t.last_at < now() - interval '90 days';
