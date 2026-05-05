alter table public.location_program_enrollments
  add column if not exists enrolled_at timestamptz not null default now(),
  add column if not exists enrolled_by_user_id text,
  add column if not exists unenrolled_at timestamptz,
  add column if not exists unenrolled_by_user_id text,
  add column if not exists unenroll_reason text;

update public.location_program_enrollments
set enrolled_at = coalesce(enrolled_at, created_at, now())
where enrolled_at is null;

alter table public.location_program_enrollments
  drop constraint if exists location_program_enrollments_location_program_key;

drop index if exists location_program_enrollments_location_program_key;
drop index if exists location_program_enrollments_active_unique_idx;

create unique index if not exists location_program_enrollments_active_unique_idx
  on public.location_program_enrollments (location_id, program_id)
  where unenrolled_at is null;

create index if not exists location_program_enrollments_program_active_idx
  on public.location_program_enrollments (program_id, unenrolled_at);
