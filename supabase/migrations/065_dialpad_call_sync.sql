-- Dialpad call-summary sync. Every call to/from a technicians-department member
-- is written here off the Dialpad call-events webhook (hangup + recap_summary
-- states). external_number is matched against contacts to attribute the call to
-- a shop (location); unmatched calls land in a manual-match queue. See
-- dialpad-call-sync-spec.md.
--
-- Schema note vs. the spec: the spec sketched bigint/shop_id, but this CRM keys
-- everything on uuid and the atomic shop unit is `locations`. call_id stays
-- bigint (it is Dialpad's own id and our upsert key); the FKs are uuid.

create table shop_call_activity (
  call_id            bigint primary key,        -- Dialpad call_id = upsert key
  location_id        uuid references locations(id) on delete set null,  -- the shop; null until matched
  contact_id         uuid references contacts(id) on delete set null,   -- matched contact; null until matched
  direction          text check (direction in ('inbound', 'outbound')),
  rw_user_id         bigint,                    -- Dialpad target.id (internal party)
  rw_user_name       text,                      -- Dialpad target.name
  external_number    text,                      -- E.164, the external party
  started_at         timestamptz,
  connected_at       timestamptz,
  ended_at           timestamptz,
  talk_sec           int,                       -- duration (ms) / 1000
  total_sec          int,                       -- total_duration (ms) / 1000, incl. ring
  summary            text,                      -- recap_summary, patched in on the later event
  summary_at         timestamptz,
  match_status       text not null default 'unmatched'
    check (match_status in ('matched', 'unmatched', 'manually_matched', 'dismissed')),
  in_queue           boolean not null default false,  -- passed the noise guard, awaiting triage
  matched_by         text,                      -- who resolved it; null if auto-matched
  matched_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index shop_call_activity_location_id_idx on shop_call_activity(location_id);
create index shop_call_activity_external_number_idx on shop_call_activity(external_number);
-- Hot path for the manual-match queue view.
create index shop_call_activity_queue_idx on shop_call_activity(started_at desc) where in_queue;

create trigger shop_call_activity_updated_at before update on shop_call_activity
  for each row execute function update_updated_at();

comment on table shop_call_activity is
  'Dialpad call summaries + metadata synced per technicians-department member; matched to a shop via contacts.';

-- Numbers a human marked "not a shop" so they never re-enter the manual-match queue.
create table dialpad_ignored_numbers (
  external_number text primary key,             -- E.164 digits (matches contacts.phone_e164 form)
  dismissed_by    text,
  dismissed_at    timestamptz not null default now()
);

-- Indexed, normalized phone for matching external_number against contacts.
-- Mirrors lib/phone.ts phoneDigitsForTel: strip to digits, prepend US country
-- code for 10-digit numbers, keep 11-digit numbers that already start with 1.
-- Resolves the spec's "is there an E.164 column to join on" open question.
alter table contacts
  add column phone_e164 text generated always as (
    case
      when phone is null then null
      when length(regexp_replace(phone, '\D', '', 'g')) = 10
        then '1' || regexp_replace(phone, '\D', '', 'g')
      when length(regexp_replace(phone, '\D', '', 'g')) = 11
           and left(regexp_replace(phone, '\D', '', 'g'), 1) = '1'
        then regexp_replace(phone, '\D', '', 'g')
      else nullif(regexp_replace(phone, '\D', '', 'g'), '')
    end
  ) stored;

create index contacts_phone_e164_idx on contacts(phone_e164);

-- A synced call is a first-class timeline event on the shop record.
alter table public.activity_log
  drop constraint if exists activity_log_type_check;

alter table public.activity_log
  add constraint activity_log_type_check
  check (
    type in (
      'email',
      'note',
      'status_change',
      'contract',
      'address_update',
      'shop_created',
      'admin_shop_match',
      'routable_enrollment_initiated',
      'routable_enrolled',
      'routable_bank_linked',
      'labor_rate_approval',
      'call'
    )
  );
