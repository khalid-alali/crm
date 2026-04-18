-- Shop profile, commercial rates (defaults for new contracts; not synced from signed contracts), churn disqualified tracking.

alter table locations
  add column if not exists shop_type text
    check (shop_type is null or shop_type in ('generalist', 'specialist'));

alter table locations
  add column if not exists high_priority_target boolean not null default false;

alter table locations
  add column if not exists website text;

alter table locations
  add column if not exists standard_labor_rate numeric;

alter table locations
  add column if not exists warranty_labor_rate numeric;

alter table locations
  add column if not exists note text;

alter table locations
  add column if not exists disqualified_reason text
    check (
      disqualified_reason is null
      or disqualified_reason in ('not_interested', 'corporate_shop', 'unresponsive', 'other')
    );

alter table locations
  add column if not exists disqualified_at timestamptz;

alter table locations
  add column if not exists disqualified_notes text;

comment on column locations.shop_type is 'Generalist vs specialist repair shop.';
comment on column locations.standard_labor_rate is 'Default customer-pay labor rate for new contracts; editable per send; not overwritten from Zoho.';
comment on column locations.warranty_labor_rate is 'Default warranty labor rate for new contracts; editable per send; not overwritten from Zoho.';
comment on column locations.note is 'Short shop note (separate from pipeline notes).';
comment on column locations.disqualified_reason is 'Disqualified reason when pipeline is Churned (inactive). Cleared when leaving Churned.';
