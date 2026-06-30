-- Embedded bank-link gate: track when a shop starts the Routable flow and when the portal unlocks.

alter table public.locations
  add column if not exists routable_link_started_at timestamptz,
  add column if not exists portal_unlocked_at timestamptz;

comment on column public.locations.routable_link_started_at is
  'When the shop started the embedded Routable bank-link flow (invite link generated). Drives polling backoff.';
comment on column public.locations.portal_unlocked_at is
  'When the enrollment portal bank-link gate cleared (Routable status accepted / payment method linked).';

-- Backfill unlock timestamp for shops that already linked before this migration.
update public.locations
set portal_unlocked_at = coalesce(pm_last_checked_at, now())
where portal_unlocked_at is null
  and coalesce(routable_payment_method_count, 0) > 0;

update public.locations
set portal_unlocked_at = now()
where portal_unlocked_at is null
  and lower(coalesce(routable_status, '')) = 'accepted';

create index if not exists idx_locations_routable_status_poll
  on public.locations (routable_link_started_at, pm_last_checked_at)
  where routable_id is not null
    and btrim(routable_id) <> ''
    and portal_unlocked_at is null;
