export type TemplateKey = 'intro' | 'followup' | 'onboarding' | 'reengage'

export const templates: Record<TemplateKey, { subject: string; body: string }> = {
  intro: {
    subject: 'Unlock New EV Repair Opportunities',
    body: `Hi {{contact_name}},\n\n{{portal_url}}\n\nBest,\n{{sender_name}}`,
  },
  followup: {
    subject: 'Following up — RepairWise x {{shop_name}}',
    body: `Hi {{contact_name}},\n\nJust wanted to follow up on my previous note.\n\nBest,\n{{sender_name}}`,
  },
  onboarding: {
    subject: 'Welcome to RepairWise — next steps for {{shop_name}}',
    body: `Hi {{contact_name}},\n\nExcited to get {{shop_name}} set up.\n\nBest,\n{{sender_name}}`,
  },
  reengage: {
    subject: 'Checking in — RepairWise',
    body: `Hi {{contact_name}},\n\nHoping to reconnect about RepairWise.\n\nBest,\n{{sender_name}}`,
  },
}

export function renderTemplate(key: TemplateKey, vars: Record<string, string>) {
  const t = templates[key]
  const replace = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
  return { subject: replace(t.subject), body: replace(t.body) }
}
