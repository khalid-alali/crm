-- Google Places enrichment for lead intake and future backfills.
-- Promoted CRM columns stay on `locations`; full payload + geometry live here.

alter table locations
  add column if not exists phone text;

alter table locations
  add column if not exists enrichment_status text
    check (
      enrichment_status is null
      or enrichment_status in ('enriched', 'needs_review', 'failed')
    );

comment on column locations.phone is 'Business phone when promoted from Google Places (or ops); contact phones live on contacts.';
comment on column locations.enrichment_status is 'Google Places pipeline: enriched, needs_review (unresolved), failed (API/transport). Null = legacy / not run.';

create table if not exists location_enrichment (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,

  place_id text,
  formatted_address text,
  google_rating numeric,
  google_review_count integer,
  business_status text,
  website text,
  phone_places text,
  geometry_lat numeric,
  geometry_lng numeric,

  enrichment_source text not null default 'google_places'
    check (enrichment_source = 'google_places'),
  enrichment_status text not null
    check (enrichment_status in ('enriched', 'needs_review', 'failed')),
  raw_payload jsonb not null default '{}'::jsonb,
  enriched_at timestamptz not null default now(),

  constraint location_enrichment_location_id_key unique (location_id)
);

create index if not exists location_enrichment_place_id_idx
  on location_enrichment (place_id)
  where place_id is not null;

comment on table location_enrichment is 'Google Places metadata keyed by location; raw_payload stores text search + details responses.';
