-- One-time complimentary Expert Assist consult per shop.

alter table public.locations
  add column if not exists consult_first_free_used_at timestamptz;

alter table public.consult_cases
  add column if not exists is_complimentary boolean not null default false;

comment on column public.locations.consult_first_free_used_at is
  'When the shop consumed its one-time complimentary Expert Assist consult (first successful close).';

comment on column public.consult_cases.is_complimentary is
  'True when this close was the shop''s waived first consult (no Stripe charge).';

-- Backfill: shops that already have a closed consult
update public.locations l
set consult_first_free_used_at = sub.first_closed
from (
  select shop_id, min(closed_at) as first_closed
  from public.consult_cases
  where status = 'closed' and shop_id is not null and closed_at is not null
  group by shop_id
) sub
where l.id = sub.shop_id
  and l.consult_first_free_used_at is null;

-- Sync funnel checklist for backfilled shops with active expert_assist enrollments
insert into public.program_enrollment_checklist (
  enrollment_id,
  item_key,
  completed_at,
  completed_by_user_id,
  updated_at
)
select
  e.id,
  'free_consult_used',
  l.consult_first_free_used_at,
  'migration',
  now()
from public.location_program_enrollments e
join public.locations l on l.id = e.location_id
where e.program_id = 'expert_assist'
  and e.unenrolled_at is null
  and l.consult_first_free_used_at is not null
on conflict (enrollment_id, item_key) do update
set
  completed_at = excluded.completed_at,
  completed_by_user_id = excluded.completed_by_user_id,
  updated_at = excluded.updated_at
where public.program_enrollment_checklist.completed_at is null;
