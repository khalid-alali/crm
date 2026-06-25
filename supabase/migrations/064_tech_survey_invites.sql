-- Technician competency survey invitations. The shop owner invites techs by
-- email from the onboarding portal; each tech gets their own link to the
-- Technician EV Readiness survey. Draft answers live here until submitted; on
-- submit a row is written to tech_competency_surveys and the invite is marked
-- completed.

create table tech_survey_invites (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  email text not null,

  status text not null default 'invited' check (status in ('invited', 'completed', 'bounced')),
  sent_at timestamptz,
  completed_at timestamptz,

  -- Partial answers saved as the tech fills the form (before submit).
  draft_responses jsonb not null default '{}'::jsonb,
  -- Set on submit; links to the completed survey row.
  tech_competency_survey_id uuid references tech_competency_surveys(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tech_survey_invites_location_id_idx on tech_survey_invites (location_id);
create unique index tech_survey_invites_location_email_idx
  on tech_survey_invites (location_id, lower(email));

create trigger tech_survey_invites_updated_at before update on tech_survey_invites
  for each row execute function update_updated_at();

comment on table tech_survey_invites is
  'Per-tech invitations to the Technician EV Readiness survey, sent by the shop owner from the onboarding portal.';
