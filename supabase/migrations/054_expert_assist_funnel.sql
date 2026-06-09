-- Expert Assist activation funnel: invite tracking + funnel stage values on enrollments.

alter table public.locations
  add column if not exists consult_invited_at timestamptz;

comment on column public.locations.consult_invited_at is
  'First time an Expert Assist invite link was generated for this shop.';

-- Extend stage check to include Expert Assist funnel stages alongside Tesla/VinFast stages.
alter table public.location_program_enrollments
  drop constraint if exists location_program_enrollments_stage_check;

alter table public.location_program_enrollments
  add constraint location_program_enrollments_stage_check
  check (stage in (
    'not_ready',
    'getting_ready',
    'ready',
    'active',
    'disqualified',
    'invited',
    'signed_up',
    'engaged',
    'activated',
    'dormant'
  ));

create index if not exists location_program_enrollments_expert_assist_stage_idx
  on public.location_program_enrollments (program_id, stage)
  where program_id = 'expert_assist' and unenrolled_at is null;
