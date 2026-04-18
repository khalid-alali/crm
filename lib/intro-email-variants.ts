/** Intro email bodies (Multibrand vs VinFast). HTML. Placeholders: {{first_name}}, {{shop_name}}, {{portal_url}}, {{sender_name}} */

export type IntroVariantId = 'multibrand' | 'vinfast' | 'freeform'

export const INTRO_VARIANT_META: Record<IntroVariantId, { label: string; description: string }> = {
  multibrand: {
    label: 'Multibrand / general EV',
    description: 'Standard partnership overview without VinFast OEM emphasis.',
  },
  vinfast: {
    label: 'VinFast OEM',
    description: 'Same story with VinFast OEM program and OEM repair positioning.',
  },
  freeform: {
    label: 'Freeform',
    description: 'Start from a short outline and write your own subject and body.',
  },
}

export const INTRO_VARIANTS: Record<IntroVariantId, { subject: string; body: string }> = {
  multibrand: {
    subject: 'Unlock New EV Repair Opportunities',
    body: `<p>Hi {{first_name}},</p>
<p>I hope you're doing well! It was great connecting with you, I wanted to follow up with more details about how partnering with RepairWise can benefit your shops.</p>
<p>RepairWise specializes in connecting independent shops with Electric Vehicle customers ready for repairs. We provide a streamlined process that helps you expand into the EV market with confidence. Here's how it works:</p>
<h2>How RepairWise Works</h2>
<ul>
<li><strong>Revenue Sharing:</strong> We take a 15% share of the repair order (RO) for every customer referral, ensuring a mutually beneficial partnership.</li>
<li><strong>Comprehensive Support:</strong> You'll receive diagnosed customers, step-by-step repair plans, and ongoing technical guidance from our expert EV technicians.</li>
<li><strong>Customer Assurance:</strong> We charge customers directly to confirm their commitment. Jobs are scheduled only after parts are in place, and we absorb the 3% credit card transaction fee.</li>
<li><strong>Flexibility:</strong> You have complete freedom to accept or decline jobs based on your capacity and preferences.</li>
</ul>
<h2>Why Partner with RepairWise?</h2>
<ul>
<li><strong>Qualified Customers:</strong> We bring you customers who know their vehicle's issues and are ready to proceed—no wasted time.</li>
<li><strong>No Marketing Costs:</strong> We handle customer acquisition, saving you time and money.</li>
<li><strong>Pre-Approved Repairs:</strong> You maintain control over the work with estimates reviewed and approved by your team.</li>
<li><strong>Expand Your Services:</strong> Gain the ability to say, "Yes, we work on Electric Vehicles," and tap into the rapidly growing EV repair market.</li>
</ul>
<h2>Common Electric Vehicle Repairs We Handle</h2>
<p>Our partner shops often manage jobs like:</p>
<ul>
<li>AC system issues (refrigerant recharges, compressors, thermal expansion valves, condenser fans)</li>
<li>Door handle replacements</li>
<li>Charge port and HV cable repairs</li>
<li>Pyro fuse replacements</li>
<li>Battery and powertrain rebuilds</li>
<li>Control arm replacements</li>
<li>HV isolation issues (with proper training and PPE)</li>
<li>Tires and alignments</li>
</ul>
<p>Let me know if you have any questions. — I'll send over an agreement under a separate email.</p>
<p>Please <a href="{{portal_url}}">fill out this form</a> so we can better understand your shop's capabilities.</p>
<p>Looking forward to hearing from you!</p>
<p>Best,<br>{{sender_name}}</p>`,
  },
  vinfast: {
    subject: 'Unlock New EV Repair Opportunities',
    body: `<p>Hi {{first_name}},</p>
<p>I hope you're doing well! It was great connecting with you. I am sending this detailed overview of how a partnership with RepairWise can benefit your shops.</p>
<p>RepairWise specializes in connecting independent shops with Electric Vehicle customers ready for repairs. We provide a streamlined process that helps you confidently expand into the EV market, including access to our VinFast OEM program. This program connects partner shops with verified OEM training, certification, parts, and repair data for higher-quality, compliant repairs.</p>
<h2>How RepairWise Works</h2>
<ul>
<li><strong>Revenue Sharing:</strong> We take a 15% share of the repair order (RO) for every customer referral, ensuring a mutually beneficial partnership.</li>
<li><strong>Comprehensive Support:</strong> You'll receive diagnosed customers, step-by-step repair plans, and ongoing technical guidance from our expert EV technicians.</li>
<li><strong>Customer Assurance:</strong> We charge customers directly to confirm their commitment. Jobs are scheduled only after parts are secured, and we absorb the 3% credit card transaction fee.</li>
<li><strong>Flexibility:</strong> You have complete freedom to accept or decline jobs based on your shop's capacity and preferences.</li>
</ul>
<h2>Why Partner with RepairWise?</h2>
<ul>
<li><strong>Qualified Customers:</strong> We bring you customers who already know their vehicle's issues and are ready to proceed—no wasted time.</li>
<li><strong>No Marketing Costs:</strong> We handle customer acquisition, saving you both time and money.</li>
<li><strong>Pre-Approved Repairs:</strong> You maintain full control over estimates and approvals.</li>
<li><strong>Expand Your Services:</strong> Confidently say, "Yes, we work on EVs," and tap into the rapidly growing EV repair market.</li>
<li><strong>VinFast OEM Program Access:</strong> Gain direct support for OEM repair procedures, verified parts sourcing, and repair documentation to meet manufacturer-level standards.</li>
</ul>
<h2>Common EV Repairs Our Partner Shops Handle</h2>
<ul>
<li>AC system issues (refrigerant recharges, compressors, thermal expansion valves, condenser fans)</li>
<li>Door handle replacements</li>
<li>Charge port and HV cable repairs</li>
<li>Pyro fuse replacements</li>
<li>Battery and powertrain rebuilds</li>
<li>Control arm replacements</li>
<li>HV isolation repairs (with proper training and PPE)</li>
<li>Tires and alignments</li>
</ul>
<p>Let me know if you have any questions—I'll send the agreement over in a separate email.</p>
<p>Please <a href="{{portal_url}}">fill out this form</a> so we can better understand your shop's capabilities.</p>
<p>Looking forward to hearing from you!</p>
<p>Best,<br>{{sender_name}}</p>`,
  },
  freeform: {
    subject: 'RepairWise — {{shop_name}}',
    body: `<p>Hi {{first_name}},</p>
<p></p>
<p>Please <a href="{{portal_url}}">fill out this form</a> so we can better understand your shop's capabilities.</p>
<p>Best,<br>{{sender_name}}</p>`,
  },
}

export function applyIntroVariant(
  variant: IntroVariantId,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const v = INTRO_VARIANTS[variant]
  let subject = v.subject
  let body = v.body
  for (const [key, value] of Object.entries(vars)) {
    const token = `{{${key}}}`
    subject = subject.split(token).join(value)
    body = body.split(token).join(value)
  }
  return { subject, body }
}
