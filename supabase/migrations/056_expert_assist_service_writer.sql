-- Expert Assist signup: service writer who receives setup instructions and texts the expert.

alter table public.contacts
  add column if not exists is_expert_assist_service_writer boolean not null default false;

comment on column public.contacts.is_expert_assist_service_writer is
  'True for the location''s designated Expert Assist service writer (setup instructions + SMS consults).';

create unique index if not exists contacts_one_ea_service_writer_per_location_idx
  on public.contacts (location_id)
  where is_expert_assist_service_writer and location_id is not null;

alter table public.locations
  add column if not exists consult_service_writer_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists consult_service_writer_is_owner boolean;

comment on column public.locations.consult_service_writer_contact_id is
  'CRM contact who receives Expert Assist setup instructions and is the intended SMS service writer.';
comment on column public.locations.consult_service_writer_is_owner is
  'Signup answer: true when the enrolling user selected "I''m the service writer".';

alter table public.shop_approved_contacts
  drop constraint if exists shop_approved_contacts_added_via_check;

alter table public.shop_approved_contacts
  add constraint shop_approved_contacts_added_via_check
  check (added_via in ('expert_added', 'self_claimed', 'owner_added', 'signup'));
