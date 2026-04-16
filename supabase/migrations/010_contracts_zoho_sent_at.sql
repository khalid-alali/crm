alter table contracts
  add column if not exists zoho_sent_at timestamptz;

comment on column contracts.zoho_sent_at is 'When the agreement was last sent via Zoho Sign (initial send from CRM).';
