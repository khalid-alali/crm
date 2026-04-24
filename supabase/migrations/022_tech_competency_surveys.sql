-- Per-technician competency / skills survey (Grid export). Many rows per location.

create table tech_competency_surveys (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,

  tech_full_name text not null,
  tech_phone text,
  tech_email text,
  shop_name_raw text not null,

  responses jsonb not null default '{}'::jsonb,

  match_method text,
  match_detail text,

  source text not null default 'grid_view_csv',
  created_at timestamptz not null default now()
);

create index tech_competency_surveys_location_id_idx
  on tech_competency_surveys (location_id);

create index tech_competency_surveys_contact_id_idx
  on tech_competency_surveys (contact_id)
  where contact_id is not null;

comment on table tech_competency_surveys is
  'Technician-level competency form answers; link to locations via shop name matching on import.';

comment on column tech_competency_surveys.responses is
  'Full survey payload as JSON (all columns except redundant identity fields).';
