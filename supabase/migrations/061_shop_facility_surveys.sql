-- VinFast shop facility readiness survey (one row per location).

create table shop_facility_surveys (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,

  shop_name_raw text not null,
  external_record_id text,
  motherduck_shop_id text,
  source text not null default 'grid_view_csv',
  submitted_at timestamptz,
  responses jsonb not null default '{}'::jsonb,

  match_method text,
  match_detail text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (location_id)
);

create unique index shop_facility_surveys_external_record_id_idx
  on shop_facility_surveys (external_record_id)
  where external_record_id is not null;

create index shop_facility_surveys_motherduck_shop_id_idx
  on shop_facility_surveys (motherduck_shop_id)
  where motherduck_shop_id is not null;

comment on table shop_facility_surveys is
  'Shop-level VinFast facility readiness survey; answers in responses JSONB.';

comment on column shop_facility_surveys.external_record_id is
  'Grid/Airtable record id or CRM location uuid from CSV column 1 when present.';

comment on column shop_facility_surveys.motherduck_shop_id is
  'Admin/MotherDuck shop id from CSV at import time (may mirror locations.motherduck_shop_id).';

create trigger shop_facility_surveys_updated_at before update on shop_facility_surveys
  for each row execute function update_updated_at();
