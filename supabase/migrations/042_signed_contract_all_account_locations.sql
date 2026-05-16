-- When a contract is signed, advance pipeline status for every location on that
-- contract's account (not only rows in contract_locations). contract_locations
-- remains the source of truth for which shops the agreement covers in the UI;
-- account-level signing should still roll up status for the whole account.

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
      and l.status in ('lead', 'contacted', 'dormant', 'in_review');
  else
    -- Legacy: contract with no account — only linked locations.
    update locations l
    set status = 'contracted', updated_at = now()
    from contract_locations cl
    where cl.contract_id = p_contract_id
      and cl.location_id = l.id
      and l.status in ('lead', 'contacted', 'dormant', 'in_review');
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

-- One-time: any early-pipeline location on an account that already has a signed contract.
update locations l
set status = 'contracted', updated_at = now()
where l.status in ('lead', 'contacted', 'dormant', 'in_review')
  and l.account_id is not null
  and exists (
    select 1
    from contracts c
    where c.account_id = l.account_id
      and c.status = 'signed'
  );
