-- Extended portal capabilities (parking, equipment, service options)

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS capabilities_parking_spots_rw      INTEGER,
  ADD COLUMN IF NOT EXISTS capabilities_two_post_lifts        INTEGER,
  ADD COLUMN IF NOT EXISTS capabilities_afterhours_tow_ins    TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_night_drops            TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_tires                  TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_wheel_alignment        TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_body_work              TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_adas                   TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_ac_work                TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_forklift               TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_hv_battery_table      TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_windshields            TEXT;
