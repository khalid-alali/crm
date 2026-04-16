'use client'

const programLabels: Record<string, string> = {
  multi_drive: 'MD',
  ev_program: 'EV',
  oem_warranty: 'OEM',
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending_activation: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-600',
  terminated: 'bg-arctic-200 text-onix-600 line-through',
  not_enrolled: 'hidden',
}

interface ProgramEnrollment {
  program: string
  status: string
}

export default function ProgramBadge({ enrollments }: { enrollments: ProgramEnrollment[] }) {
  const active = enrollments.filter(e => e.status !== 'not_enrolled')
  if (!active.length) return null
  return (
    <div className="flex gap-1 flex-wrap">
      {active.map(e => (
        <span
          key={e.program}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusStyles[e.status] ?? ''}`}
        >
          {programLabels[e.program] ?? e.program}
        </span>
      ))}
    </div>
  )
}
