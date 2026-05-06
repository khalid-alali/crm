-- VinFast / ops: new shop provisioning (merge fields filled at send time).

insert into email_templates (name, category, description, subject, body_html, created_by, archived)
values (
  'New shop provisioning (dealer portal / STP)',
  'vinfast',
  'Ops: dealer code, shop name/address, portal + STP distribution lists.',
  'New shop provisioning required — {{shop_name}}',
$provisioning$
<p>New shop provisioning required:</p>
<p><strong>Dealer code:</strong> {{dealer_code}}</p>
<p><strong>Shop name:</strong> {{shop_name}}</p>
<p><strong>Shop address:</strong> {{shop_address}}</p>
<p></p>
<p><strong>Please grant Dealer portal access to the following users:</strong><br>alex@repairwise.pro, jackson@repairwise.pro, march@repairwise.pro, stefania@repairwise.pro, abigail@repairwise.pro</p>
<p><strong>Please add the shop's address to the STP accounts for the following users:</strong><br>nancy@repairwise.pro, chaveze@repairwise.pro, shaira@repairwise.pro, eunice@repairwise.pro, alex@repairwise.pro, vf@repairwise.pro, mary@repairwise.pro, sesugh@repairwise.pro, chidinma@repairwise.pro, godwin@repairwise.pro</p>
<p><strong>A separate email will be sent when the shop is ready for website bookings.</strong></p>
$provisioning$,
  null,
  false
);
