-- Multi-select: repair shop vs body shop (orthogonal to shop_type generalist/specialist).

alter table locations
  add column if not exists shop_business_types text[];

alter table locations
  drop constraint if exists locations_shop_business_types_check;

alter table locations
  add constraint locations_shop_business_types_check
  check (
    shop_business_types is null
    or shop_business_types <@ array['repair_shop', 'body_shop']::text[]
  );

comment on column locations.shop_business_types is
  'Business lines: repair_shop and/or body_shop. Distinct subset of {repair_shop, body_shop}. Null = unset.';
