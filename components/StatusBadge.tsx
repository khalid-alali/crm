'use client'

import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const styles: Record<string, string> = {
  lead: 'bg-arctic-100 text-onix-600',
  contacted: 'bg-brand-100 text-brand-700',
  prospect: 'bg-purple-100 text-purple-700',
  dormant: 'bg-amber-100 text-amber-800',
  in_review: 'bg-purple-100 text-purple-700',
  contracted: 'bg-[#CCFBF1] text-teal-800',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? 'bg-arctic-100 text-onix-600'}`}>
      {LOCATION_STATUS_LABELS[status] ?? status}
    </span>
  )
}
