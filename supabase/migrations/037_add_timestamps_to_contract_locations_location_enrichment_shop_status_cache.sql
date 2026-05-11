-- Add created_at/updated_at auditing columns to non-audited enrichment/junction tables.

-- contract_locations (junction table; composite PK)
alter table public.contract_locations
  add column if not exists created_at timestamptz default now();

alter table public.contract_locations
  add column if not exists updated_at timestamptz default now();

update public.contract_locations
  set created_at = now()
  where created_at is null;

update public.contract_locations
  set updated_at = now()
  where updated_at is null;

drop trigger if exists contract_locations_updated_at on public.contract_locations;

create trigger contract_locations_updated_at
  before update on public.contract_locations
  for each row execute function update_updated_at();


-- location_enrichment (Google Places enrichment payload)
alter table public.location_enrichment
  add column if not exists created_at timestamptz default now();

alter table public.location_enrichment
  add column if not exists updated_at timestamptz default now();

update public.location_enrichment
  set created_at = now()
  where created_at is null;

update public.location_enrichment
  set updated_at = now()
  where updated_at is null;

drop trigger if exists location_enrichment_updated_at on public.location_enrichment;

create trigger location_enrichment_updated_at
  before update on public.location_enrichment
  for each row execute function update_updated_at();


-- shop_status_cache (computed routing/pipeline job limits)
alter table public.shop_status_cache
  add column if not exists created_at timestamptz default now();

alter table public.shop_status_cache
  add column if not exists updated_at timestamptz default now();

update public.shop_status_cache
  set created_at = now()
  where created_at is null;

update public.shop_status_cache
  set updated_at = now()
  where updated_at is null;

drop trigger if exists shop_status_cache_updated_at on public.shop_status_cache;

create trigger shop_status_cache_updated_at
  before update on public.shop_status_cache
  for each row execute function update_updated_at();

