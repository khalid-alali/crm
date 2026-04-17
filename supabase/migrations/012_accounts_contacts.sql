-- Rename owners → accounts; introduce contacts; migrate person fields.

-- 1a. Rename table and FK columns (contract_locations has no owner_id)
alter table owners rename to accounts;

alter table locations rename column owner_id to account_id;
alter table contracts rename column owner_id to account_id;

-- Rename common auto-generated index names when present
alter index if exists locations_owner_id_idx rename to locations_account_id_idx;
alter index if exists contracts_owner_id_idx rename to contracts_account_id_idx;

-- Rename PK constraint if it kept the old table name
alter table accounts rename constraint owners_pkey to accounts_pkey;

-- 1b. Prepare accounts for business-only rows
alter table accounts add column if not exists business_name text;

alter table accounts rename column name to contact_migration_name;

-- 1c. Contacts table
create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  name text,
  email text,
  phone text,
  role text not null default 'other'
    check (role in (
      'owner', 'gm', 'service_advisor',
      'tech', 'training_contact', 'billing', 'other'
    )),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint contacts_must_have_parent check (
    account_id is not null or location_id is not null
  )
);

create index contacts_account_id_idx on contacts(account_id);
create index contacts_location_id_idx on contacts(location_id);

-- 1d. Seed business_name from locations
update accounts a
set business_name = sub.name
from (
  select distinct on (l.account_id)
    l.account_id,
    l.name
  from locations l
  where l.account_id is not null
  order by
    l.account_id,
    case l.status
      when 'active' then 0
      when 'contracted' then 1
      else 2
    end,
    l.created_at asc
) sub
where a.id = sub.account_id;

update accounts
set business_name = contact_migration_name
where business_name is null;

-- 1e. Seed contacts from former owner rows (pattern 3: comma-separated names)
do $$
declare
  r record;
  parts text[];
  i int;
  part text;
  is_first boolean;
begin
  for r in
    select id, contact_migration_name, email, phone, created_at
    from accounts
    where contact_migration_name is not null
      and contact_migration_name like '%,%'
      and contact_migration_name not like '%@%'
  loop
    parts := string_to_array(r.contact_migration_name, ',');
    is_first := true;
    for i in 1..coalesce(array_length(parts, 1), 0) loop
      part := trim(both from parts[i]);
      if part = '' then
        continue;
      end if;
      insert into contacts (account_id, name, email, phone, role, is_primary, created_at)
      values (
        r.id,
        part,
        case when is_first then r.email else null end,
        case when is_first then r.phone else null end,
        'owner',
        is_first,
        r.created_at
      );
      is_first := false;
    end loop;
  end loop;
end $$;

-- Pattern 2: email stored as migration name
insert into contacts (account_id, name, email, phone, role, is_primary, created_at)
select
  id,
  null,
  contact_migration_name,
  phone,
  'owner',
  true,
  created_at
from accounts
where contact_migration_name like '%@%'
  and not exists (select 1 from contacts c where c.account_id = accounts.id);

-- Pattern 1: normal person rows with email
insert into contacts (account_id, name, email, phone, role, is_primary, created_at)
select
  id,
  contact_migration_name,
  email,
  phone,
  'owner',
  true,
  created_at
from accounts
where contact_migration_name not like '%@%'
  and contact_migration_name not like '%,%'
  and contact_migration_name is not null
  and email is not null
  and not exists (select 1 from contacts c where c.account_id = accounts.id);

-- Person-like name without email (still seed one owner contact)
insert into contacts (account_id, name, email, phone, role, is_primary, created_at)
select
  id,
  contact_migration_name,
  email,
  phone,
  'owner',
  true,
  created_at
from accounts
where contact_migration_name not like '%@%'
  and contact_migration_name not like '%,%'
  and contact_migration_name is not null
  and email is null
  and not exists (select 1 from contacts c where c.account_id = accounts.id);

-- 1f. Location primary contacts (avoid duplicating account primary name)
insert into contacts (account_id, location_id, name, email, phone, role, is_primary, created_at)
select
  l.account_id,
  l.id,
  l.primary_contact_name,
  l.primary_contact_email,
  l.primary_contact_phone,
  'owner',
  false,
  now()
from locations l
where l.account_id is not null
  and l.primary_contact_name is not null
  and not exists (
    select 1
    from contacts c
    where c.account_id = l.account_id
      and c.is_primary = true
      and lower(trim(c.name)) = lower(trim(l.primary_contact_name))
  );

-- 1g. Drop migrated columns
alter table accounts drop column if exists contact_migration_name;
alter table accounts drop column if exists email;
alter table accounts drop column if exists phone;
alter table accounts drop column if exists title;

alter table locations drop column if exists primary_contact_name;
alter table locations drop column if exists primary_contact_email;
alter table locations drop column if exists primary_contact_phone;
