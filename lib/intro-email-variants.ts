/** Intro email body (single unified intro). HTML. Placeholders: {{contact_name}}, {{portal_url}}, {{sender_name}} */

export type IntroVariantId = 'standard'

export const INTRO_VARIANT_META: Record<IntroVariantId, { label: string; description: string }> = {
  standard: {
    label: 'RepairWise partnership overview',
    description: 'Unified intro covering multi-brand, EV, and OEM programs.',
  },
}

export const INTRO_VARIANTS: Record<IntroVariantId, { subject: string; body: string }> = {
  standard: {
    subject: 'Overview: RepairWise Partnership Opportunities',
    body: `<p>Hi {{contact_name}},</p>
<p>I hope you&rsquo;re doing well. It was great connecting with you&mdash;I wanted to follow up with a more detailed overview of how partnering with RepairWise can support your shop&rsquo;s growth.</p>
<p><strong>About RepairWise</strong><br>RepairWise is a technology platform that connects independent repair shops with customers ready for service, while providing diagnostics, repair planning, and ongoing support throughout the repair process. We act as a front-end for service&mdash;bringing you qualified, ready-to-book customers along with the tools and guidance needed to complete repairs efficiently and confidently.</p>
<p><strong>How it works:</strong></p>
<ul>
<li>Revenue Share: 15% of the repair order (RO) for referred jobs</li>
<li>Pre-Qualified Customers: Customers come in with identified issues and are ready to proceed</li>
<li>Repair Planning: Step-by-step repair guidance and support</li>
<li>Customer Commitment: We handle customer billing upfront and absorb credit card fees</li>
<li>Flexibility: You choose which jobs to accept based on your capacity</li>
</ul>
<p><strong>Benefits:</strong></p>
<ul>
<li>No marketing costs&mdash;we bring customers directly to you</li>
<li>Increased car count with higher-quality jobs</li>
<li>Pre-approved and structured repair workflows</li>
<li>Ability to expand services across multiple vehicle types</li>
</ul>
<p>We offer several programs, and you can choose to participate in any or all of them. EV and OEM programs may require certain equipment, and we provide training at no cost.</p>
<p><strong>I. Multi-Brand / General Repair (ICE and Hybrid)</strong><br>RepairWise supports both internal combustion engine (ICE) and hybrid vehicle repairs through our network, helping increase car count with qualified, ready-to-service customers.</p>
<p>Support includes:</p>
<ul>
<li>Diagnosed repair opportunities</li>
<li>Technical guidance from specialists</li>
<li>Repair workflows and documentation</li>
<li>Support for more complex systems and components</li>
</ul>
<p><strong>II. Electric Vehicle (EV) Program</strong><br>RepairWise helps shops confidently expand into the growing EV repair market by providing the tools, guidance, and customer flow needed to succeed.</p>
<p>Support includes:</p>
<ul>
<li>Diagnosed EV repair opportunities</li>
<li>Technical guidance from EV specialists</li>
<li>Repair workflows and documentation</li>
<li>Support for more complex systems and components</li>
</ul>
<p>Common EV repairs include:</p>
<ul>
<li>AC system issues (compressors, refrigerant, condenser fans, etc.)</li>
<li>Charge port and HV cable repairs</li>
<li>Battery and powertrain work</li>
<li>Pyro fuse replacements</li>
<li>Suspension and control arms</li>
<li>HV isolation diagnostics (with proper training/PPE)</li>
<li>Tires and alignments</li>
</ul>
<p>This allows your shop to confidently say, &ldquo;Yes, we service EVs,&rdquo; while minimizing risk and uncertainty.</p>
<p><strong>III. OEM Programs</strong><br>RepairWise also operates OEM-supported programs, including our current partnership with VinFast, where we are an authorized service provider for both warranty and customer-pay repairs.</p>
<p>Through this program, partner shops gain access to:</p>
<ul>
<li>OEM repair procedures and documentation</li>
<li>Verified parts sourcing</li>
<li>Structured warranty repair workflows</li>
<li>Training and certification support</li>
<li>Higher-value, manufacturer-aligned repair opportunities</li>
</ul>
<p>This creates an opportunity to perform repairs at a manufacturer standard while increasing revenue and technical capability within your shop.</p>
<p><strong>Next Steps</strong><br>If this sounds like a fit, I&rsquo;d be happy to walk through the platform in more detail. I will also send an agreement under a separate email.</p>
<p>In the meantime, please complete this form so we can better understand your shop&rsquo;s capabilities:<br><a href="{{portal_url}}">[Insert Form Link]</a></p>
<p>Let me know if you have any questions&mdash;I look forward to continuing the conversation.</p>
<p>Best,<br>Leo Gomez</p>`,
  },
}

export function applyIntroVariant(
  variant: IntroVariantId,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const v = INTRO_VARIANTS[variant] ?? INTRO_VARIANTS.standard
  let subject = v.subject
  let body = v.body
  for (const [key, value] of Object.entries(vars)) {
    const token = `{{${key}}}`
    subject = subject.split(token).join(value)
    body = body.split(token).join(value)
  }
  return { subject, body }
}
