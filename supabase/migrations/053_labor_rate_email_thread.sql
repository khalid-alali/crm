-- Root Message-ID for labor rate approval email threading (reminders reply in-thread).

alter table labor_rate_approvals
  add column if not exists email_thread_message_id text;
