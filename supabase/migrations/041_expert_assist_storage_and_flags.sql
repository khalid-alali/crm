-- Expert Assist: queue flag, Stripe display, Storage bucket for Twilio media rehost.

alter table public.consult_cases
  add column if not exists delivery_attention boolean not null default false;

comment on column public.consult_cases.delivery_attention is
  'Set when outbound SMS delivery fails; expert queue should surface.';

alter table public.locations
  add column if not exists consult_stripe_card_last4 text;

comment on column public.locations.consult_stripe_card_last4 is
  'Last 4 of default payment method (Expert Assist), for CRM display.';

-- Private bucket; CRM uploads via service role only (signed URLs for display).
insert into storage.buckets (id, name, public)
values ('consult-media', 'consult-media', false)
on conflict (id) do nothing;

-- Latest message per case for queue SLA columns (no heavy client-side grouping).
create or replace function public.consult_latest_message_for_cases(p_ids uuid[])
returns table (case_id uuid, direction text, created_at timestamptz)
language sql
stable
as $$
  select distinct on (m.case_id) m.case_id, m.direction, m.created_at
  from public.consult_messages m
  where m.case_id = any(p_ids)
  order by m.case_id, m.created_at desc;
$$;
