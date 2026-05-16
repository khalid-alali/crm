-- Expert Assist (SMS consult) module — schema per internal SOW.
-- Applies new columns on locations (shops) and adds case / messaging / audit tables.

-- --- Locations: billing + consult settings ---
alter table public.locations
  add column if not exists consult_stripe_customer_id text,
  add column if not exists consult_stripe_payment_method_id text,
  add column if not exists consult_billing_email text,
  add column if not exists consult_billing_contact_name text,
  add column if not exists consult_billing_status text not null default 'not_setup'
    check (consult_billing_status in ('not_setup', 'active', 'payment_failed', 'paused')),
  add column if not exists consult_short_code text,
  add column if not exists consult_enabled boolean not null default false,
  add column if not exists consult_internal_notes text;

comment on column public.locations.consult_stripe_customer_id is 'Stripe Customer id for Expert Assist card-on-file.';
comment on column public.locations.consult_stripe_payment_method_id is 'Default Stripe PaymentMethod id for off-session charges.';
comment on column public.locations.consult_billing_email is 'Receipt + billing outreach email for consult charges.';
comment on column public.locations.consult_billing_contact_name is 'Display name for billing contact.';
comment on column public.locations.consult_billing_status is 'Expert Assist billing lifecycle (gates consult_enabled workflows in app).';
comment on column public.locations.consult_short_code is 'Uppercase shop code for SMS claim flow; unique when set.';
comment on column public.locations.consult_enabled is 'Whether this shop may use Expert Assist once billing is active.';
comment on column public.locations.consult_internal_notes is 'Internal-only notes for the Expert Assist program.';

create unique index if not exists locations_consult_short_code_unique
  on public.locations (consult_short_code)
  where consult_short_code is not null;

-- --- Approved contacts (phone ↔ shop) ---
create table if not exists public.shop_approved_contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locations(id) on delete cascade,
  phone_number text not null,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  added_via text not null
    check (added_via in ('expert_added', 'self_claimed', 'owner_added')),
  claimed_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id text,
  revoked_at timestamptz,
  revoked_by_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists shop_approved_contacts_shop_id_idx
  on public.shop_approved_contacts (shop_id);

create index if not exists shop_approved_contacts_phone_approved_idx
  on public.shop_approved_contacts (phone_number)
  where status = 'approved';

comment on table public.shop_approved_contacts is 'Phone numbers authorized to open Expert Assist consults for a shop.';

-- At most one approved row per E.164 number globally (expert resolves pending conflicts).
create unique index if not exists shop_approved_contacts_one_approved_phone
  on public.shop_approved_contacts (phone_number)
  where status = 'approved';

-- --- Consult cases ---
create table if not exists public.consult_cases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.locations(id) on delete set null,
  originating_phone_number text not null,
  originating_contact_id uuid references public.shop_approved_contacts(id) on delete set null,
  status text not null default 'awaiting_shop_code'
    check (status in (
      'awaiting_shop_code',
      'awaiting_expert_approval',
      'open',
      'closed',
      'billing_failed',
      'cancelled'
    )),
  vin text,
  year text,
  model text,
  trim text,
  initial_question text,
  expert_notes text,
  outcome text
    check (outcome is null or outcome in (
      'resolved_on_call',
      'recommended_toolbox',
      'out_of_scope',
      'no_show',
      'cancelled'
    )),
  timer_started_at timestamptz,
  timer_stopped_at timestamptz,
  billable_seconds integer,
  billed_amount_cents integer,
  stripe_charge_id text,
  payment_status text
    check (payment_status is null or payment_status in ('pending', 'processing', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint consult_cases_open_requires_shop_and_contact check (
    status <> 'open'
    or (shop_id is not null and originating_contact_id is not null)
  )
);

create index if not exists consult_cases_status_created_idx
  on public.consult_cases (status, created_at desc);

comment on table public.consult_cases is 'Expert Assist consult lifecycle, timer, and billing summary.';

-- --- Messages ---
create table if not exists public.consult_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.consult_cases(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  body text,
  media_urls text[] not null default '{}',
  from_number text,
  to_number text,
  twilio_message_sid text,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz not null default now()
);

create unique index if not exists consult_messages_twilio_sid_unique
  on public.consult_messages (twilio_message_sid)
  where twilio_message_sid is not null;

create index if not exists consult_messages_case_created_idx
  on public.consult_messages (case_id, created_at);

-- --- Audit events ---
create table if not exists public.consult_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.consult_cases(id) on delete cascade,
  event_type text not null check (event_type in (
    'created',
    'shop_linked',
    'contact_pending',
    'contact_approved',
    'timer_started',
    'timer_stopped',
    'outcome_set',
    'closed',
    'charged',
    'charge_failed',
    'note_added'
  )),
  actor_type text not null check (actor_type in ('system', 'expert', 'shop')),
  actor_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists consult_case_events_case_idx
  on public.consult_case_events (case_id, created_at);
