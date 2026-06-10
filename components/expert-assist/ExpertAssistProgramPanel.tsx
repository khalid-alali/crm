'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EXPERT_ASSIST_STAGE_LABELS } from '@/lib/expert-assist-funnel/stages'
import type { ExpertAssistShopProgramView } from '@/lib/expert-assist-enrollments'

const DISPLAY_CHECKLIST_ORDER = [
  'card_on_file',
  'front_desk_sms_delivered',
  'owner_forward_clicked',
  'counter_card_downloaded',
  'welcome_kit_shipped',
  'printout_photo_received',
] as const

type Props = {
  view: ExpertAssistShopProgramView
  shopName: string
  ownerName: string
  hasCardOnFile: boolean
}

function formatDays(value: number | null): string {
  if (value == null) return '—'
  if (value === 0) return 'Today'
  return `${value}d`
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-onix-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-onix-900">{value}</p>
    </div>
  )
}

export default function ExpertAssistProgramPanel({ view, shopName, ownerName, hasCardOnFile }: Props) {
  const router = useRouter()
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checklistByKey = new Map(view.checklist.map(item => [item.itemKey, item]))

  function isItemChecked(itemKey: string): boolean {
    if (itemKey === 'card_on_file') {
      return Boolean(checklistByKey.get(itemKey)?.completedAt) || hasCardOnFile
    }
    if (itemKey === 'first_inbound_sms') return view.firstInboundSms
    if (itemKey === 'first_consult_complete') return view.firstConsultComplete
    if (itemKey === 'second_consult_complete') return view.secondConsultComplete
    return Boolean(checklistByKey.get(itemKey)?.completedAt)
  }

  function itemLabel(itemKey: string): string {
    if (itemKey === 'first_inbound_sms') return 'First inbound SMS'
    if (itemKey === 'first_consult_complete') return 'First consult complete'
    if (itemKey === 'second_consult_complete') return 'Second consult complete'
    return checklistByKey.get(itemKey)?.label ?? itemKey
  }

  function isItemReadOnly(itemKey: string): boolean {
    if (itemKey === 'first_inbound_sms' || itemKey === 'first_consult_complete' || itemKey === 'second_consult_complete') {
      return true
    }
    return checklistByKey.get(itemKey)?.readOnly === true
  }

  async function toggleChecklist(itemKey: string, completed: boolean) {
    setBusyItem(itemKey)
    setError(null)
    try {
      const item = checklistByKey.get(itemKey)
      const res = await fetch(`/api/expert-assist/enrollments/${view.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_key: itemKey,
          completed,
          notes: item?.notes ?? null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Checklist update failed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checklist update failed')
    } finally {
      setBusyItem(null)
    }
  }

  const displayItems = [
    ...DISPLAY_CHECKLIST_ORDER,
    'first_inbound_sms',
    'first_consult_complete',
    'second_consult_complete',
  ] as const

  return (
    <div className="space-y-4 rounded-lg border border-arctic-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-onix-950">Expert Assist activation</h3>
          <p className="text-sm text-onix-500">
            Enrolled {formatShortDate(view.enrolledAt)} ·{' '}
            <span className="font-medium text-onix-700">{EXPERT_ASSIST_STAGE_LABELS[view.stage]}</span>
            {view.manualStageOverride ? (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                Manual stage
              </span>
            ) : null}
          </p>
        </div>
        <Link
          href={`/shops/${view.locationId}?tab=expert-assist`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Expert Assist settings →
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCell label="Shop name" value={shopName} />
        <StatCell label="Address" value={view.address ?? '—'} />
        <StatCell label="Owner" value={ownerName || view.ownerName || '—'} />
        <StatCell label="Service advisor contact" value={view.serviceAdvisorContact ?? '—'} />
        <StatCell label="Stage" value={EXPERT_ASSIST_STAGE_LABELS[view.stage]} />
        <StatCell label="Days since signup" value={formatDays(view.daysSinceSignup)} />
        <StatCell label="Days since last activity" value={formatDays(view.daysSinceLastActivity)} />
        <StatCell label="Days since last consult" value={formatDays(view.daysSinceLastConsult)} />
      </div>

      <div className="space-y-2 border-t border-arctic-100 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-onix-500">Activation checklist</p>
        <div className="space-y-1">
          {displayItems.map(itemKey => {
            const checked = isItemChecked(itemKey)
            const readOnly = isItemReadOnly(itemKey)
            return (
              <label
                key={itemKey}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                  readOnly ? 'text-onix-600' : 'text-onix-800'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={readOnly || busyItem === itemKey}
                  onChange={e => {
                    if (readOnly) return
                    void toggleChecklist(itemKey, e.target.checked)
                  }}
                />
                <span>{itemLabel(itemKey)}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 border-t border-arctic-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell label="Consult count" value={String(view.closedConsultCount)} />
        <StatCell label="Unique QR scan count" value={String(view.uniqueQrScanCount)} />
        <StatCell
          label="Free consult used"
          value={view.freeConsultUsedAt ? formatShortDate(view.freeConsultUsedAt) : 'No'}
        />
        <StatCell label="Last consult date" value={formatShortDate(view.lastClosedAt)} />
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-800">Next action</p>
        <p className="mt-0.5 text-sm font-medium text-onix-900">{view.nextAction}</p>
      </div>
    </div>
  )
}
