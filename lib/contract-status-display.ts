/** Labels and badge styles for `contracts.status` (not location pipeline status). */
const LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
  declined: 'Declined',
  revoked: 'Revoked',
}

const BADGE_CLASS: Record<string, string> = {
  draft: 'bg-arctic-100 text-onix-700',
  sent: 'bg-amber-100 text-amber-900',
  viewed: 'bg-sky-100 text-sky-900',
  signed: 'bg-emerald-100 text-emerald-900',
  declined: 'bg-red-100 text-red-800',
  revoked: 'bg-slate-200 text-slate-800',
}

export function contractStatusLabel(status: string): string {
  return LABELS[status] ?? status
}

export function contractStatusBadgeClass(status: string): string {
  return BADGE_CLASS[status] ?? 'bg-arctic-100 text-onix-600'
}
