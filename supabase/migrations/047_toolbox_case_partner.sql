-- Toolbox referral attribution (RepairWise sign-up ?casePartner=) — separate from Expert Assist SMS shop code.

alter table public.locations
  add column if not exists toolbox_case_partner text;

comment on column public.locations.toolbox_case_partner is
  'RepairWise Toolbox sign-up casePartner value for this shop. Unrelated to consult_short_code (Expert Assist SMS).';

create unique index if not exists locations_toolbox_case_partner_unique
  on public.locations (toolbox_case_partner)
  where toolbox_case_partner is not null;
