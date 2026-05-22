-- Legal entity name at account and location level (separate from contract.signed legal_entity_name).

alter table accounts
  add column if not exists legal_entity_name text;

alter table locations
  add column if not exists legal_entity_name text;

comment on column accounts.legal_entity_name is 'Legal entity or DBA name for the account; CRM-entered, not normalized.';
comment on column locations.legal_entity_name is 'Legal entity or DBA name for this shop; CRM-entered, not normalized.';
