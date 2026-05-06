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
      'routable_bank_linked'
    )
  );
