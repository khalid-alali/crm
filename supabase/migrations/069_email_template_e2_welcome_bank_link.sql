-- E2 welcome & bank link template (Fixlane onboarding flow).
-- Uses {{routable_bank_link}} — minted to a Routable embedded flow URL on send.

insert into email_templates (
  id,
  name,
  category,
  description,
  subject,
  body_html,
  created_by,
  archived
)
values (
  'e2c3d4e5-f6a7-4901-bcde-f12345678902',
  'E2 — Welcome & bank link',
  'general',
  'Sent when a shop signs their contract. CTA links directly to Routable bank linking; returns to onboarding portal on completion.',
  'You''re in. Here''s what''s next.',
$e2body$
<p>Hey {{contact_first_name}},</p>
<p></p>
<p>Contract signed. Welcome to Fixlane.</p>
<p></p>
<p>Here&rsquo;s where things stand: your account is being set up on our end. While we do that, there&rsquo;s one thing we need from you &mdash; connect your bank account through Routable so payments can flow through without a hitch.</p>
<p></p>
<p>It takes about 5 minutes and it&rsquo;s the only step that&rsquo;s blocking your go-live.</p>
<p></p>
<p><a href="{{routable_bank_link}}">Connect your bank account</a></p>
<p></p>
<p>When you&rsquo;re done, you&rsquo;ll land in your onboarding portal to finish program setup.</p>
<p></p>
<p>Any questions, reply here &mdash; your onboarding manager will handle it personally.</p>
<p></p>
<p>&mdash; The Fixlane Team</p>
$e2body$,
  null,
  false
)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  subject = excluded.subject,
  body_html = excluded.body_html,
  archived = false,
  updated_at = now();
