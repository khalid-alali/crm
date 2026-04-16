-- Query 1: shops with signed contract PDF coverage but no Admin shop id.
with contract_pdf_by_location as (
  select
    cl.location_id,
    count(*) filter (where c.doc_storage_path is not null) as pdf_contract_count
  from contract_locations cl
  join contracts c on c.id = cl.contract_id
  group by cl.location_id
)
select
  l.id as location_id,
  l.name as shop_name,
  l.city,
  l.state,
  o.name as owner_name,
  coalesce(o.email, l.primary_contact_email) as best_email,
  cp.pdf_contract_count
from locations l
join contract_pdf_by_location cp on cp.location_id = l.id
left join owners o on o.id = l.owner_id
where cp.pdf_contract_count > 0
  and l.motherduck_shop_id is null
order by cp.pdf_contract_count desc, l.name;

-- Query 2: shops with Admin shop id but no signed contract PDF coverage.
with contract_pdf_by_location as (
  select
    cl.location_id,
    count(*) filter (where c.doc_storage_path is not null) as pdf_contract_count
  from contract_locations cl
  join contracts c on c.id = cl.contract_id
  group by cl.location_id
)
select
  l.id as location_id,
  l.name as shop_name,
  l.city,
  l.state,
  l.motherduck_shop_id,
  o.name as owner_name,
  coalesce(o.email, l.primary_contact_email) as best_email,
  coalesce(cp.pdf_contract_count, 0) as pdf_contract_count
from locations l
left join owners o on o.id = l.owner_id
left join contract_pdf_by_location cp on cp.location_id = l.id
where l.motherduck_shop_id is not null
  and coalesce(cp.pdf_contract_count, 0) = 0
order by l.name;
