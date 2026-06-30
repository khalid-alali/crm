alter table shop_call_activity
  add column if not exists dialpad_contact_name text;

comment on column shop_call_activity.dialpad_contact_name is
  'Caller/callee display name from Dialpad (webhook contact or contacts API lookup).';
