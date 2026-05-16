'use client'

import type { ConsultCaseStatus } from '@/lib/expert-assist/types'
import { CONSULT_CASE_STATUS_LABELS } from '@/lib/expert-assist/types'

const styles: Partial<Record<ConsultCaseStatus, string>> & { default: string } = {
  awaiting_shop_code: 'bg-arctic-100 text-onix-600',
  awaiting_expert_approval: 'bg-amber-100 text-amber-900',
  open: 'bg-brand-100 text-brand-800',
  closed: 'bg-green-100 text-green-800',
  billing_failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-onix-100 text-onix-700',
  default: 'bg-arctic-100 text-onix-600',
}

export default function ConsultCaseStatusBadge({ status }: { status: ConsultCaseStatus }) {
  const label = CONSULT_CASE_STATUS_LABELS[status] ?? status
  const cls = styles[status] ?? styles.default
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}
