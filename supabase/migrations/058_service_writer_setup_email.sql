-- Expert Assist: service writer setup via email (replaces front-desk welcome SMS tracking).

alter table public.activation_state
  rename column front_desk_sms_delivered_at to service_writer_setup_email_sent_at;

comment on column public.activation_state.service_writer_setup_email_sent_at is
  'When setup instructions were emailed to the designated Expert Assist service writer.';

update public.program_enrollment_checklist
set item_key = 'service_writer_setup_email_sent'
where item_key = 'front_desk_sms_delivered';
