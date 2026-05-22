-- One-time backfill: Prospect (contacted) → Dormant for shops tied to an expired unsigned Zoho contract.
-- Idempotent — only updates rows still at status 'contacted'.
--
-- Expired unsigned contract = any of:
--   • CRM saw Zoho expiration (contracts.status = declined + activity "Contract expired")
--   • Still sent/viewed in CRM but zoho_sent_at is older than 14 days (unsigned envelope window)

with expired_contracts as (
  select distinct c.id as contract_id
  from contracts c
  where c.zoho_sign_request_id is not null
    and (
      (
        c.status in ('sent', 'viewed')
        and c.zoho_sent_at is not null
        and c.zoho_sent_at < now() - interval '14 days'
      )
      or (
        c.status = 'declined'
        and exists (
          select 1
          from contract_locations cl
          join activity_log al on al.location_id = cl.location_id
          where cl.contract_id = c.id
            and al.type = 'contract'
            and al.subject = 'Contract expired'
        )
      )
    )
),
target_locations as (
  select distinct l.id as location_id
  from locations l
  join contract_locations cl on cl.location_id = l.id
  join expired_contracts ec on ec.contract_id = cl.contract_id
  where l.status = 'contacted'
    and l.deleted_at is null
),
updated as (
  update locations l
  set status = 'dormant', updated_at = now()
  from target_locations t
  where l.id = t.location_id
    and l.status = 'contacted'
  returning l.id
)
insert into activity_log (location_id, type, subject, body, sent_by)
select
  u.id,
  'status_change',
  'Pipeline status',
  'Prospect → Dormant (one-time backfill: expired unsigned Zoho contract)',
  'system'
from updated u;
