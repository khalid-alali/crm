-- Multi-recipient email sends: canonical To/Cc arrays (to_email remains first To for back-compat).
alter table activity_log
  add column if not exists recipients jsonb;

create index if not exists activity_log_recipients_gin
  on activity_log using gin (recipients);
