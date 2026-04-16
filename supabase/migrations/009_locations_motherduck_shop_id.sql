alter table locations
  add column if not exists motherduck_shop_id text;

-- Backfill rows previously tagged in notes by sync script.
update locations
set motherduck_shop_id = substring(notes from 'motherduck_shop_id=([0-9a-fA-F-]{36})')
where motherduck_shop_id is null
  and notes like '%motherduck_shop_id=%';

create unique index if not exists locations_motherduck_shop_id_uidx
  on locations (motherduck_shop_id)
  where motherduck_shop_id is not null;
