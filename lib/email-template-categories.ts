export const EMAIL_TEMPLATE_CATEGORIES = [
  'vinfast',
  'tesla',
  'multidrive',
  'general',
  'bdr_outreach',
] as const

export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number]

export function isEmailTemplateCategory(s: string): s is EmailTemplateCategory {
  return (EMAIL_TEMPLATE_CATEGORIES as readonly string[]).includes(s)
}

export const EMAIL_TEMPLATE_CATEGORY_LABELS: Record<EmailTemplateCategory, string> = {
  vinfast: 'VinFast',
  tesla: 'Tesla / EV',
  multidrive: 'Multidrive',
  general: 'General',
  bdr_outreach: 'BDR outreach',
}
