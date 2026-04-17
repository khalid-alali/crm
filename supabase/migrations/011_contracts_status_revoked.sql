-- Allow contracts recalled / revoked in Zoho Sign (CRM no longer resubmits the same request).
alter table contracts drop constraint if exists contracts_status_check;

alter table contracts
  add constraint contracts_status_check
  check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'revoked'));
