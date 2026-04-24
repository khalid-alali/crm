create table if not exists location_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  program_id text not null,
  stage text not null default 'not_ready'
    check (stage in ('not_ready', 'getting_ready', 'ready', 'active', 'disqualified')),
  tier text
    check (tier in ('generalist', 'specialist') or tier is null),
  manual_stage_override boolean not null default false,
  last_touched_at timestamptz not null default now(),
  first_job_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_program_enrollments_location_program_key unique (location_id, program_id)
);

create index if not exists location_program_enrollments_program_id_idx
  on location_program_enrollments (program_id);

create index if not exists location_program_enrollments_stage_idx
  on location_program_enrollments (stage);

create index if not exists location_program_enrollments_location_id_idx
  on location_program_enrollments (location_id);

create index if not exists location_program_enrollments_last_touched_at_idx
  on location_program_enrollments (last_touched_at desc);

create table if not exists program_enrollment_checklist (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references location_program_enrollments(id) on delete cascade,
  item_key text not null,
  completed_at timestamptz,
  completed_by_user_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_enrollment_checklist_enrollment_item_key unique (enrollment_id, item_key)
);

create index if not exists program_enrollment_checklist_enrollment_id_idx
  on program_enrollment_checklist (enrollment_id);

create index if not exists program_enrollment_checklist_item_key_idx
  on program_enrollment_checklist (item_key);

create trigger location_program_enrollments_updated_at before update on location_program_enrollments
  for each row execute function update_updated_at();

create trigger program_enrollment_checklist_updated_at before update on program_enrollment_checklist
  for each row execute function update_updated_at();
