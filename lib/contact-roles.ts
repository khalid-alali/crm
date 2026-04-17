export const CONTACT_ROLES = [
  'owner',
  'gm',
  'service_advisor',
  'tech',
  'training_contact',
  'billing',
  'other',
] as const

export type ContactRole = (typeof CONTACT_ROLES)[number]

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  owner: 'Owner',
  gm: 'GM',
  service_advisor: 'Service advisor',
  tech: 'Tech',
  training_contact: 'Training contact',
  billing: 'Billing',
  other: 'Other',
}

export function isContactRole(value: unknown): value is ContactRole {
  return typeof value === 'string' && (CONTACT_ROLES as readonly string[]).includes(value)
}
