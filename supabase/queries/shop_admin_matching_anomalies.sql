-- Shops with a signed PDF contract but no MotherDuck admin shop id (manual matching candidates).
-- After migration 012: accounts + contacts replace owners + location primary_contact_*.

select
  l.id as location_id,
  l.name as shop_name,
  l.city,
  l.state,
  a.business_name as account_name,
  primary_contact.email as primary_contact_email,
  l.motherduck_shop_id
from locations l
left join accounts a on a.id = l.account_id
left join lateral (
  select c2.email
  from contacts c2
  where c2.location_id = l.id
     or (c2.account_id = l.account_id and c2.location_id is null)
  order by c2.is_primary desc, c2.created_at asc
  limit 1
) primary_contact on true
where l.motherduck_shop_id is null
  and exists (
    select 1
    from contract_locations cl
    join contracts ct on ct.id = cl.contract_id
    where cl.location_id = l.id
      and ct.doc_storage_path is not null
  )
order by l.name;
