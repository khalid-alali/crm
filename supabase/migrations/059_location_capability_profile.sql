-- Operator-set capability profile tags for job routing (manual only; never auto-filled).

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS eligibility   TEXT CHECK (eligibility IN ('tesla_ev', 'tesla', 'ev', 'none')),
  ADD COLUMN IF NOT EXISTS auto_depth    TEXT CHECK (auto_depth IN ('light', 'heavy')),
  ADD COLUMN IF NOT EXISTS lv_depth      TEXT CHECK (lv_depth IN ('light', 'heavy')),
  ADD COLUMN IF NOT EXISTS hv_depth      TEXT CHECK (hv_depth IN ('light', 'heavy', 'heavy_plus')),
  ADD COLUMN IF NOT EXISTS adas_depth    TEXT CHECK (adas_depth IN ('light', 'heavy')),
  ADD COLUMN IF NOT EXISTS profile_set_by TEXT,
  ADD COLUMN IF NOT EXISTS profile_set_at TIMESTAMPTZ;
