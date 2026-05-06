-- Add Routable/QuickBooks linkage fields and polling index.
-- Reuse existing routable_payment_method_count (no new pm_count column).

-- Normalize blank routable IDs so uniqueness/index filters work consistently.
update public.locations
set routable_id = null
where routable_id is not null
  and btrim(routable_id) = '';

alter table public.locations
  add column if not exists routable_enrolled_at timestamptz,
  add column if not exists quickbooks_vendor_id text,
  add column if not exists pm_last_checked_at timestamptz;

alter table public.locations
  alter column routable_payment_method_count set default 0;

update public.locations
set routable_payment_method_count = 0
where routable_payment_method_count is null;

-- Enforce uniqueness only for non-empty routable IDs.
create unique index if not exists idx_locations_routable_id_unique
  on public.locations (routable_id)
  where routable_id is not null and btrim(routable_id) <> '';

create index if not exists idx_locations_pm_polling
  on public.locations (routable_id, routable_payment_method_count)
  where routable_id is not null
    and btrim(routable_id) <> ''
    and routable_payment_method_count = 0;
