-- Expert Assist public surfaces: invite revocation, pending billing, checkout session tracking.

alter table public.locations
  add column if not exists consult_invite_revoked_at timestamptz,
  add column if not exists consult_stripe_checkout_session_id text;

comment on column public.locations.consult_invite_revoked_at is 'When set, public /s/<token> invite links show revoked state.';
comment on column public.locations.consult_stripe_checkout_session_id is 'Stripe Checkout Session id while consult_billing_status is pending.';

alter table public.locations drop constraint if exists locations_consult_billing_status_check;

alter table public.locations
  add constraint locations_consult_billing_status_check
  check (consult_billing_status in ('not_setup', 'pending', 'active', 'payment_failed', 'paused'));
