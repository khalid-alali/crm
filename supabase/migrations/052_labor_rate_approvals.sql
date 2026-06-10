-- VinFast labor rate approval workflow (one row per location).

create table labor_rate_approvals (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references locations(id) on delete cascade,
  warranty_rate      numeric not null,
  charge_rate        numeric not null,
  status             text not null default 'requested'
                     check (status in ('requested','approved','changes_requested','escalated','expired')),
  submitted_by_email text,
  submitted_at       timestamptz not null default now(),
  sla_due_at         timestamptz not null,
  decided_at         timestamptz,
  decided_by_name    text,
  decision_reason    text,
  escalated_at       timestamptz,
  decision_token     text unique not null,
  token_used_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (location_id)
);

create index labor_rate_approvals_status_idx on labor_rate_approvals (status);
create index labor_rate_approvals_sla_due_at_idx on labor_rate_approvals (sla_due_at);

create trigger labor_rate_approvals_updated_at before update on labor_rate_approvals
  for each row execute function update_updated_at();

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
      'labor_rate_approval'
    )
  );
