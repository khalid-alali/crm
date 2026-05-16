'use client'

import { useRouter } from 'next/navigation'
import ConsultCaseStatusBadge from '@/components/expert-assist/ConsultCaseStatusBadge'
import type { ConsultCaseStatus, ConsultQueueRow } from '@/lib/expert-assist/types'

function formatWait(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  if (ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function lastReplyLabel(row: ConsultQueueRow): string {
  const d = row.last_message_direction
  if (!d) return '—'
  const t = row.last_message_at ? new Date(row.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return t ? `${d} · ${t}` : d
}

function rowNeedsAttention(row: ConsultQueueRow): boolean {
  if (row.delivery_attention) return true
  if (row.last_message_direction !== 'inbound' || !row.last_message_at) return false
  return Date.now() - new Date(row.last_message_at).getTime() > 5 * 60 * 1000
}

function timerLabel(row: ConsultQueueRow): string {
  if (row.timer_started_at && !row.timer_stopped_at) return 'Running'
  if (row.timer_stopped_at) return 'Stopped'
  return '—'
}

const th =
  'border-b border-arctic-200 bg-arctic-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-onix-600'

export default function ConsultQueueTables({
  pending,
  open,
  schemaError,
}: {
  pending: ConsultQueueRow[]
  open: ConsultQueueRow[]
  schemaError?: string | null
}) {
  const router = useRouter()

  return (
    <div className="space-y-10">
      {schemaError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Consult tables not available</p>
          <p className="mt-1 text-amber-900/90">{schemaError}</p>
          <p className="mt-2 text-xs text-amber-800/90">
            Apply migration <code className="rounded bg-amber-100/80 px-1">040_expert_assist_consults.sql</code> to enable
            this page.
          </p>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-onix-950">Pending approval</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{pending.length}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-arctic-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Waiting</th>
                <th className={th}>Shop</th>
                <th className={th}>From</th>
                <th className={th}>Preview</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="table-row-group text-onix-800">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-onix-500">
                    No cases awaiting expert approval.
                  </td>
                </tr>
              ) : (
                pending.map(row => (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/consults/${row.id}`)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/consults/${row.id}`)
                      }
                    }}
                    className="cursor-pointer border-b border-arctic-100 hover:bg-arctic-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-onix-700">{formatWait(row.created_at)}</td>
                    <td className="px-3 py-2.5 font-medium text-onix-950">{row.shop?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.originating_phone_number}</td>
                    <td className="max-w-xs truncate px-3 py-2.5 text-onix-600" title={row.initial_question ?? ''}>
                      {row.initial_question ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConsultCaseStatusBadge status={row.status as ConsultCaseStatus} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-onix-950">Open cases</h2>
        <div className="overflow-x-auto rounded-lg border border-arctic-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Waiting</th>
                <th className={th}>Shop</th>
                <th className={th}>Contact</th>
                <th className={th}>VIN</th>
                <th className={th}>Question</th>
                <th className={th}>Timer</th>
                <th className={th}>Last reply</th>
              </tr>
            </thead>
            <tbody className="table-row-group text-onix-800">
              {open.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-onix-500">
                    No open consults.
                  </td>
                </tr>
              ) : (
                open.map(row => {
                  const contactLabel =
                    row.contact?.display_name && row.contact.display_name.trim()
                      ? `${row.contact.display_name} · ${row.contact.phone_number}`
                      : row.contact?.phone_number ?? row.originating_phone_number
                  return (
                    <tr
                      key={row.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/consults/${row.id}`)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/consults/${row.id}`)
                        }
                      }}
                      className={`cursor-pointer border-b border-arctic-100 hover:bg-arctic-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${
                        rowNeedsAttention(row) ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-onix-700">{formatWait(row.created_at)}</td>
                      <td className="px-3 py-2.5 font-medium text-onix-950">{row.shop?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{contactLabel}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.vin ?? '—'}</td>
                      <td className="max-w-xs truncate px-3 py-2.5 text-onix-600" title={row.initial_question ?? ''}>
                        {row.initial_question ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{timerLabel(row)}</td>
                      <td className="px-3 py-2.5 text-xs text-onix-600">{lastReplyLabel(row)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
