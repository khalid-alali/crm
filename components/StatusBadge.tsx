'use client'

import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const styles: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-600',
  contacted: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  contracted: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {LOCATION_STATUS_LABELS[status] ?? status}
    </span>
  )
}
