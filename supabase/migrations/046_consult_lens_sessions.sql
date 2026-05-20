-- Expert Assist — Zoho Lens video sessions (expert escalation, phase 1)

create table if not exists public.consult_lens_sessions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.consult_cases(id) on delete cascade,
  zoho_schedule_id text,
  zoho_session_key text,
  mode text not null check (mode in ('instant', 'scheduled')),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  technician_url text not null,
  customer_join_url text not null,
  status text not null default 'created'
    check (status in ('created', 'notified', 'completed', 'cancelled', 'no_show')),
  created_by_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists consult_lens_sessions_case_idx
  on public.consult_lens_sessions (case_id, created_at desc);

comment on table public.consult_lens_sessions is 'Zoho Lens remote support sessions tied to Expert Assist consult cases.';

alter table public.consult_case_events
  drop constraint if exists consult_case_events_event_type_check;

alter table public.consult_case_events
  add constraint consult_case_events_event_type_check
  check (event_type in (
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
    'note_added',
    'lens_session_created',
    'lens_session_scheduled'
  ));
