alter table email_templates
  add column if not exists default_recipients text[],
  add column if not exists default_cc_recipients text[];
