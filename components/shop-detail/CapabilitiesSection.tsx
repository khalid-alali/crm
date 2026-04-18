'use client'

import { formatHoursForDisplay } from '@/lib/portal-hours-schedule'
import { formatAllocatedTechsDisplay } from '@/lib/portal-capabilities-form'

interface CapabilitiesData {
  bar_license_number: string | null
  hours_of_operation: string | null
  standard_warranty: string | null
  total_techs: number | null
  allocated_techs: number | null
  daily_appointment_capacity: number | null
  weekly_appointment_capacity: number | null
  capabilities_submitted_at: string | null
  state: string | null
}

interface Props {
  location: CapabilitiesData
  onSendForm?: () => void
}

export function CapabilitiesSection({ location, onSendForm }: Props) {
  const submitted = !!location.capabilities_submitted_at

  if (!submitted) {
    return (
      <div className="rounded-lg border border-dashed border-arctic-300 p-6 text-center">
        <p className="mb-3 text-sm text-onix-500">Shop hasn&apos;t submitted their capabilities yet.</p>
        {onSendForm && (
          <button
            type="button"
            onClick={onSendForm}
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Send capabilities form →
          </button>
        )}
      </div>
    )
  }

  const isCA =
    location.state?.toUpperCase() === 'CA' || location.state?.toUpperCase() === 'CALIFORNIA'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-onix-900">Shop Capabilities</h3>
        <span className="text-xs text-onix-400">
          Submitted{' '}
          {new Date(location.capabilities_submitted_at!).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Techs" value={location.total_techs} />
        <StatCard
          label="Allocated to Fixlane"
          value={location.allocated_techs}
          formatValue={formatAllocatedTechsDisplay}
        />
        <StatCard label="Daily Capacity" value={location.daily_appointment_capacity} />
        <StatCard label="Weekly Capacity" value={location.weekly_appointment_capacity} />
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <DetailRow label="Hours" value={formatHoursForDisplay(location.hours_of_operation)} />
        <DetailRow label="Warranty" value={location.standard_warranty} />
        {isCA && <DetailRow label="BAR License" value={location.bar_license_number} />}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  formatValue,
}: {
  label: string
  value: number | null
  formatValue?: (n: number | null) => string
}) {
  const display = formatValue ? formatValue(value) : value ?? '—'
  return (
    <div className="rounded-lg bg-arctic-50 p-3">
      <div className="text-2xl font-bold text-onix-950">{display}</div>
      <div className="mt-0.5 text-xs text-onix-500">{label}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-onix-500">{label}:</span>{' '}
      <span className="text-onix-900">{value || '—'}</span>
    </div>
  )
}
