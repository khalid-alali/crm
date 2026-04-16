-- Some databases still have the old signing-request id column name; normalize to zoho_sign_request_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contracts'
      and column_name = 'pandadoc_id'
  ) then
    alter table contracts rename column pandadoc_id to zoho_sign_request_id;
  end if;
end $$;
