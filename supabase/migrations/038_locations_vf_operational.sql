-- Post-launch VinFast ops labels on CRM locations (keyed implicitly via motherduck_shop_id when linked).

alter table public.locations
  add column if not exists vf_operational_status text,
  add column if not exists on_vf_website boolean not null default false;

comment on column public.locations.vf_operational_status is
  'VinFast post-launch operational label (e.g. Fully Operational, Slow Operational, PIP). Nullable until set.';
comment on column public.locations.on_vf_website is
  'Whether the shop appears on the VinFast website. Defaults false.';
