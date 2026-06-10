-- Expert Assist activation funnel: per-location facts + append-only shop events.

create table if not exists public.activation_state (
  location_id uuid primary key references public.locations(id) on delete cascade,

  -- Checkbox timestamps (activation checklist)
  card_added_at timestamptz,
  owner_forward_clicked_at timestamptz,
  front_desk_sms_delivered_at timestamptz,
  counter_card_downloaded_at timestamptz,
  welcome_kit_shipped_at timestamptz,
  printout_photo_received_at timestamptz,
  qr_first_scanned_at timestamptz,
  free_consult_used_at timestamptz,

  -- Funnel facts
  signed_up_at timestamptz,
  first_inbound_at timestamptz,
  first_consult_at timestamptz,
  last_consult_at timestamptz,
  consult_count integer not null default 0 check (consult_count >= 0),

  -- Referral facts
  first_referral_at timestamptz,
  referral_count integer not null default 0 check (referral_count >= 0),
  last_referral_at timestamptz,

  -- Config
  activation_variant text not null default 'card_required'
    check (activation_variant in ('card_required', 'card_after_first_consult')),
  is_high_value boolean not null default false,
  sms_channel_dead boolean not null default false,

  -- QR
  qr_scan_count integer not null default 0 check (qr_scan_count >= 0),

  -- Derived cache (written only by recomputeStage)
  stage text not null default 'invited'
    check (stage in ('invited', 'signed_up', 'engaged', 'activated', 'active', 'dormant')),
  stage_changed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.activation_state is
  'Expert Assist activation facts + derived funnel stage per location. stage is cache-only; recomputeStage is sole writer.';

comment on column public.activation_state.stage is
  'Derived funnel stage cache. Do not write directly — use recomputeStage(location_id).';

create index if not exists activation_state_stage_idx
  on public.activation_state (stage);

create index if not exists activation_state_signed_up_at_idx
  on public.activation_state (signed_up_at)
  where signed_up_at is not null;

create trigger activation_state_updated_at before update on public.activation_state
  for each row execute function update_updated_at();

-- Append-only event log for idempotent sends and shop timeline.
create table if not exists public.shop_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint shop_events_location_type_dedupe_key unique (location_id, event_type, dedupe_key)
);

comment on table public.shop_events is
  'Append-only Expert Assist shop event log. Unique (location_id, event_type, dedupe_key) enables idempotent writes.';

create index if not exists shop_events_location_created_at_idx
  on public.shop_events (location_id, created_at desc);

create index if not exists shop_events_event_type_idx
  on public.shop_events (event_type);
