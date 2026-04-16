-- Any location linked to a signed contract should leave early pipeline stages.
-- (App pipeline uses `contracted`, not a separate "signed" on locations.)

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
    and l.status in ('lead', 'contacted', 'in_review');
end;
$$;

create or replace function trg_contracts_signed_sync_locations()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'signed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform sync_locations_for_signed_contract(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_signed_sync_locations on contracts;
create trigger contracts_signed_sync_locations
  after insert or update of status on contracts
  for each row
  execute function trg_contracts_signed_sync_locations();

create or replace function trg_contract_locations_link_signed_contract()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from contracts c where c.id = new.contract_id and c.status = 'signed') then
    update locations l
    set status = 'contracted', updated_at = now()
    where l.id = new.location_id
      and l.status in ('lead', 'contacted', 'in_review');
  end if;
  return new;
end;
$$;

drop trigger if exists contract_locations_signed_sync on contract_locations;
create trigger contract_locations_signed_sync
  after insert on contract_locations
  for each row
  execute function trg_contract_locations_link_signed_contract();

-- One-time backfill for rows that drifted (e.g. CSV import before triggers).
update locations l
set status = 'contracted', updated_at = now()
where l.status in ('lead', 'contacted', 'in_review')
  and exists (
    select 1
    from contract_locations cl
    join contracts c on c.id = cl.contract_id
    where cl.location_id = l.id
      and c.status = 'signed'
  );
