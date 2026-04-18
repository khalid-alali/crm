-- Consolidated on `disqualified_reason` only (see 016 / app).
alter table locations drop column if exists lost_reason;
