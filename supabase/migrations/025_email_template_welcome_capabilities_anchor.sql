-- Refresh welcome template paragraph: anchor text + capabilities href (for DBs that already ran 024).

update email_templates
set body_html = replace(
  body_html,
  '<p>In the meantime, please complete this form so we can better understand your shop&rsquo;s capabilities:<br><a href="{{capabilities_link}}">Capabilities form (link generated on send)</a></p>',
  '<p>In the meantime, please <a href="{{capabilities_link}}">complete your shop capabilities form</a> so we can better understand what you offer.</p>'
)
where name = 'RepairWise partnership overview'
  and body_html like '%Capabilities form (link generated on send)%';
