create type task_status as enum ('open', 'done', 'snoozed');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text,
  due_date date,
  status task_status not null default 'open',
  snoozed_until date,
  created_by_email text not null,
  program_context text check (program_context in ('vinfast', 'tesla', 'multidrive', 'general')),
  source text not null default 'manual',
  trigger_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint resolved_at_consistency check (
    (status = 'done' and resolved_at is not null)
    or (status != 'done' and resolved_at is null)
  ),
  constraint snoozed_until_consistency check (
    (status = 'snoozed' and snoozed_until is not null)
    or (status != 'snoozed')
  )
);

create index idx_tasks_created_by_email_status
  on tasks(created_by_email, status)
  where status != 'done';

create index idx_tasks_location_id on tasks(location_id);

create index idx_tasks_due_date
  on tasks(due_date)
  where status = 'open' and due_date is not null;

create or replace function update_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
before update on tasks
for each row
execute function update_tasks_updated_at();

create or replace function set_resolved_at()
returns trigger as $$
begin
  if new.status = 'done' and old.status != 'done' then
    new.resolved_at = now();
  elsif new.status != 'done' then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tasks_resolved_at
before update on tasks
for each row
execute function set_resolved_at();
