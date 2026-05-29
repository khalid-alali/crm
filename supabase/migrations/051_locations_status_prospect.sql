-- Pipeline status `prospect`: contract sent via Zoho Sign, between Contacted and Dormant.

alter table locations
  drop constraint if exists locations_status_check;

alter table locations
  add constraint locations_status_check
  check (status in (
    'lead',
    'contacted',
    'prospect',
    'dormant',
    'in_review',
    'contracted',
    'active',
    'inactive'
  ));

create or replace function sync_locations_for_signed_contract(p_contract_id uuid)
returns void
language plpgsql
as $$
declare
  v_account_id uuid;
begin
  select c.account_id into v_account_id
  from contracts c
  where c.id = p_contract_id;

  if v_account_id is not null then
    update locations l
    set status = 'contracted', updated_at = now()
    where l.account_id = v_account_id
      and l.status in ('lead', 'contacted', 'prospect', 'dormant', 'in_review');
  else
    update locations l
    set status = 'contracted', updated_at = now()
    from contract_locations cl
    where cl.contract_id = p_contract_id
      and cl.location_id = l.id
      and l.status in ('lead', 'contacted', 'prospect', 'dormant', 'in_review');
  end if;
end;
$$;

create or replace function trg_contract_locations_link_signed_contract()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from contracts c where c.id = new.contract_id and c.status = 'signed') then
    perform sync_locations_for_signed_contract(new.contract_id);
  end if;
  return new;
end;
$$;

-- Shops with an open (sent/viewed) Zoho contract → Prospect.
with target as (
  select l.id as location_id, l.status as from_status
  from locations l
  where l.deleted_at is null
    and l.status in ('lead', 'contacted', 'dormant', 'in_review')
    and exists (
      select 1
      from contract_locations cl
      join contracts c on c.id = cl.contract_id
      where cl.location_id = l.id
        and c.zoho_sign_request_id is not null
        and c.status in ('sent', 'viewed')
    )
),
updated as (
  update locations l
  set status = 'prospect', updated_at = now()
  from target t
  where l.id = t.location_id
  returning l.id, t.from_status
)
insert into activity_log (location_id, type, subject, body, sent_by)
select
  u.id,
  'status_change',
  'Pipeline status',
  u.from_status || ' → Prospect (backfill: open Zoho contract)',
  'system'
from updated u;
