-- Optional franchise / ops store identifier (e.g. Midas shop #). No UI yet.

alter table locations
  add column if not exists store_number text;

comment on column locations.store_number is 'Operator/franchise store or shop number from imports (e.g. SHOP #); optional.';
