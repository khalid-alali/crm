'use client'

import { useEffect, useState } from 'react'
import { computeLastActivityDisplay, type LastActivityDot } from '@/lib/last-activity-display'

const dotClass: Record<LastActivityDot, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
}

export default function LastActivityCell({
  createdAt,
  lastActivityAt,
}: {
  createdAt: string
  lastActivityAt: string | null
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 text-xs text-onix-300 tabular-nums" aria-hidden>
        <span className="h-2 w-2 shrink-0 rounded-full bg-arctic-200" />
        <span>—</span>
      </div>
    )
  }

  const { label, dot } = computeLastActivityDisplay(createdAt, lastActivityAt)

  return (
    <div className="flex items-center gap-2 text-xs text-onix-800 tabular-nums">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass[dot]}`}
        title={`Last activity: ${label}`}
        aria-hidden
      />
      <span>{label}</span>
    </div>
  )
}
