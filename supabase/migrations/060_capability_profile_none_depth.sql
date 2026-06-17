-- Allow explicit "none" depth for auto, LV, HV, and ADAS capability profile tags.

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_auto_depth_check;
ALTER TABLE locations ADD CONSTRAINT locations_auto_depth_check
  CHECK (auto_depth IN ('light', 'heavy', 'none'));

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_lv_depth_check;
ALTER TABLE locations ADD CONSTRAINT locations_lv_depth_check
  CHECK (lv_depth IN ('light', 'heavy', 'none'));

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_hv_depth_check;
ALTER TABLE locations ADD CONSTRAINT locations_hv_depth_check
  CHECK (hv_depth IN ('light', 'heavy', 'heavy_plus', 'none'));

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_adas_depth_check;
ALTER TABLE locations ADD CONSTRAINT locations_adas_depth_check
  CHECK (adas_depth IN ('light', 'heavy', 'none'));
