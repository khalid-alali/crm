-- Product label + API: "activity log" — table rename only (columns unchanged).
alter table comms_log rename to activity_log;

-- Default index name from `create index on comms_log(location_id)` in 001_initial.sql
alter index if exists comms_log_location_id_idx rename to activity_log_location_id_idx;
