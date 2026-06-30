-- Expert Assist lifecycle marketing plan — durable send gates
alter table public.activation_state
  add column if not exists ref_push_1_sent boolean not null default false,
  add column if not exists dor75_sent boolean not null default false,
  add column if not exists toolkit_link_clicked_at timestamptz;

comment on column public.activation_state.ref_push_1_sent is
  'REF-PUSH-1 sent after 2nd completed consult; prevents re-fire across dormant cycles.';
comment on column public.activation_state.dor75_sent is
  'DOR-75 one-time win-back SMS sent; never repeat per shop.';
comment on column public.activation_state.toolkit_link_clicked_at is
  'Owner opened handoff toolkit; suppresses REF-PUSH-2 when set.';
