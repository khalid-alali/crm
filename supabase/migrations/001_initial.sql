create table owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  title text,
  notes text,
  created_at timestamptz default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain_name text,

  owner_id uuid references owners(id) on delete set null,

  address_line1 text,
  city text,
  state text,
  postal_code text,
  lat numeric,
  lng numeric,
  geocoded_at timestamptz,

  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,

  status text not null default 'lead'
    check (status in ('lead','contacted','in_review','contracted','active','inactive')),
  assigned_to text,
  source text,
  notes text,

  vf_onboarding_name text,
  vf_onboarding_status text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table program_enrollments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  program text not null check (program in ('multi_drive', 'ev_program', 'oem_warranty')),
  status text not null default 'not_enrolled'
    check (status in ('not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated')),
  enrolled_at timestamptz,
  updated_at timestamptz default now(),
  unique(location_id, program)
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id) on delete set null,

  legal_entity_name text,
  counterparty_company text,
  counterparty_name text,
  counterparty_email text,
  counterparty_phone text,
  counterparty_title text,
  signing_date timestamptz,
  address text,
  standard_labor_rate numeric,
  warranty_labor_rate numeric,
  website text,
  notes text,

  zoho_sign_request_id text,
  status text default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'declined')),
  doc_url text,

  created_at timestamptz default now()
);

create table contract_locations (
  contract_id uuid references contracts(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  primary key (contract_id, location_id)
);

create table comms_log (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  type text not null check (type in ('email', 'note', 'status_change', 'contract', 'address_update')),
  subject text,
  body text,
  to_email text,
  sent_by text,
  created_at timestamptz default now()
);

create index on locations(status);
create index on locations(chain_name);
create index on locations(owner_id);
create index on locations(assigned_to);
create index on program_enrollments(location_id);
create index on contracts(owner_id);
create index on comms_log(location_id);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger locations_updated_at before update on locations
  for each row execute function update_updated_at();
