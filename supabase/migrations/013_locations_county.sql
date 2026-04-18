alter table locations add column if not exists county text;

comment on column locations.county is 'US county from Google Geocoding administrative_area_level_2; set on forward geocode.';
