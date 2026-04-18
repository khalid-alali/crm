-- Shop capabilities (portal form; replaces external Fillout intake)

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS bar_license_number          TEXT,
  ADD COLUMN IF NOT EXISTS hours_of_operation           TEXT,
  ADD COLUMN IF NOT EXISTS standard_warranty            TEXT,
  ADD COLUMN IF NOT EXISTS total_techs                  INTEGER,
  ADD COLUMN IF NOT EXISTS allocated_techs              INTEGER,
  ADD COLUMN IF NOT EXISTS daily_appointment_capacity   INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_appointment_capacity  INTEGER,
  ADD COLUMN IF NOT EXISTS capabilities_submitted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_locations_capabilities_submitted
  ON locations (capabilities_submitted_at)
  WHERE capabilities_submitted_at IS NULL;
