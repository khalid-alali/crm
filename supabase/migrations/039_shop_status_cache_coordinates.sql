-- Cache shop coordinates from upstream status data when available.

alter table public.shop_status_cache
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

comment on column public.shop_status_cache.latitude is
  'Latitude coordinate for the cached shop record, when provided by upstream data.';

comment on column public.shop_status_cache.longitude is
  'Longitude coordinate for the cached shop record, when provided by upstream data.';
