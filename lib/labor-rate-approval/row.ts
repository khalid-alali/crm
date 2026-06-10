import { formatMonD } from '@/lib/labor-rate-approval/sla'
import type { LaborRateApprovalRow, LaborRateApprovalStatus } from '@/lib/labor-rate-approval/types'

const ACTIONABLE_STATUSES: LaborRateApprovalStatus[] = ['requested', 'changes_requested', 'escalated']

export function isTokenActionable(row: LaborRateApprovalRow): boolean {
  if (row.token_used_at) return false
  return ACTIONABLE_STATUSES.includes(row.status)
}

export function statusDateForCard(row: LaborRateApprovalRow): string | null {
  if (row.status === 'approved' || row.status === 'changes_requested') {
    return row.decided_at
  }
  if (row.status === 'escalated') {
    return row.escalated_at
  }
  if (row.status === 'expired') {
    return row.updated_at
  }
  return row.updated_at
}

export function cardLabelForStatus(row: LaborRateApprovalRow): string | null {
  const dateIso = statusDateForCard(row)
  const datePart = dateIso ? formatMonD(dateIso) : ''

  switch (row.status) {
    case 'requested':
      return datePart ? `Requested ${datePart}` : 'Requested'
    case 'changes_requested':
      return datePart ? `Changes requested ${datePart}` : 'Changes requested'
    case 'approved':
      return datePart ? `Approved ${datePart}` : 'Approved'
    case 'escalated':
      return datePart ? `Escalated ${datePart}` : 'Escalated'
    case 'expired':
      return 'Expired'
    default:
      return null
  }
}

export type LaborRateApprovalCardView = {
  status: LaborRateApprovalStatus
  statusDate: string | null
  statusLabel: string | null
  warrantyLaborRate: number
  chargeRate: number
}

export function toCardView(row: LaborRateApprovalRow | null | undefined): LaborRateApprovalCardView | null {
  if (!row) return null
  return {
    status: row.status,
    statusDate: statusDateForCard(row),
    statusLabel: cardLabelForStatus(row),
    warrantyLaborRate: Number(row.warranty_rate),
    chargeRate: Number(row.charge_rate),
  }
}
