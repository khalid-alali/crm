-- Routable (CRM source of truth), VinFast go-live date, ADAS capability.
-- VinFast / RW dealer codes remain on shop_status_cache only.

alter table public.locations
  add column if not exists routable_id text,
  add column if not exists routable_payment_method_count integer,
  add column if not exists routable_status text,
  add column if not exists routable_account_last4 text,
  add column if not exists last_routable_link_sent_at timestamptz,
  add column if not exists vf_go_live_week date,
  add column if not exists adas_calibration_equipped boolean;

comment on column public.locations.routable_id is 'Routable company/payee id; CRM canonical; may mirror shop_status_cache until sync is unified.';
comment on column public.locations.vf_go_live_week is 'Target go-live date (week normalized to a single calendar date on import).';

-- One-time backfill: copy routable_id from Admin cache where location is linked and CRM field is empty.
update public.locations l
set routable_id = nullif(trim(c.routable_id), '')
from public.shop_status_cache c
where l.motherduck_shop_id is not null
  and trim(l.motherduck_shop_id) <> ''
  and l.motherduck_shop_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and c.shop_id = l.motherduck_shop_id::uuid
  and (l.routable_id is null or trim(l.routable_id) = '')
  and c.routable_id is not null
  and trim(c.routable_id) <> '';
