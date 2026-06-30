const CALL_QUEUE_ALLOWED_EMAIL = 'khalid@repairwise.pro'

export function canAccessCallQueue(userEmail: string | null | undefined): boolean {
  return userEmail?.trim().toLowerCase() === CALL_QUEUE_ALLOWED_EMAIL
}
