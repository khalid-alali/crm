alter table contracts
  add column if not exists doc_storage_bucket text,
  add column if not exists doc_storage_path text,
  add column if not exists doc_uploaded_at timestamptz,
  add column if not exists doc_source text
    check (doc_source in ('zoho', 'manual', 'imported'));

create index if not exists contracts_doc_storage_path_idx
  on contracts (doc_storage_path)
  where doc_storage_path is not null;
