const CONTRACT_DELETE_ALLOWED_EMAIL = 'khalid@repairwise.pro'

export function canDeleteContracts(userEmail: string | null | undefined): boolean {
  const normalized = userEmail?.trim().toLowerCase()
  return normalized === CONTRACT_DELETE_ALLOWED_EMAIL
}
