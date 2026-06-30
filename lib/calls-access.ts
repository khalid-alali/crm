const CALL_QUEUE_ALLOWED_EMAILS = new Set(['khalid@repairwise.pro', 'nic@repairwise.pro'])

export function canAccessCallQueue(userEmail: string | null | undefined): boolean {
  const email = userEmail?.trim().toLowerCase()
  return email != null && CALL_QUEUE_ALLOWED_EMAILS.has(email)
}
