-- Allow audit row when a location is first created (API inserts type shop_created).
alter table activity_log drop constraint if exists comms_log_type_check;

alter table activity_log add constraint activity_log_type_check
  check (type in (
    'email',
    'note',
    'status_change',
    'contract',
    'address_update',
    'shop_created'
  ));
