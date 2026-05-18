'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import ConsultQueuePill from '@/components/expert-assist/ConsultQueuePill'
import { useConsultQueuePoll } from '@/components/expert-assist/useConsultQueuePoll'
import {
  activeTimerSeconds,
  filterOpenCases,
  formatConsultCaseId,
  formatCreatedTime,
  formatTimerClock,
  formatVehicleLabel,
  formatWaitMinutes,
  getQueuePill,
  getQueueQuestionPreview,
  getTimerVisualState,
  matchesTimerChip,
  partitionOpenCases,
  waitAnchorIso,
  type QueueFilter,
} from '@/lib/expert-assist/queue-display'
import type { ConsultQueueRow } from '@/lib/expert-assist/types'

import './expert-assist-tokens.css'
import './expert-assist-components.css'
import './expert-assist-queue.css'

const th =
  'border-b border-arctic-200 bg-arctic-50 px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-onix-600'

function CaseTable({
  rows,
  variant,
  nowMs,
  onRowClick,
}: {
  rows: ConsultQueueRow[]
  variant: 'action' | 'await'
  nowMs: number
  onRowClick: (id: string) => void
}) {
  const isAction = variant === 'action'

  return (
    <div className="overflow-hidden rounded-lg border border-arctic-200 bg-white">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={`${th} w-[90px]`}>Case</th>
            <th className={`${th} w-[130px]`}>Status</th>
            <th className={th}>Shop</th>
            <th className={th}>Vehicle</th>
            <th className={th}>Question</th>
            <th className={`${th} w-[90px]`}>Waiting</th>
            <th className={`${th} w-[100px]`}>Created</th>
            <th className={`${th} w-[80px]`}>Timer</th>
          </tr>
        </thead>
        <tbody className="text-onix-800">
          {rows.map(row => {
            const anchor = waitAnchorIso(row)
            const timerSecs = activeTimerSeconds(row, nowMs)
            const timerState = getTimerVisualState(timerSecs)
            const { model, year } = formatVehicleLabel(row)

            return (
              <tr
                key={row.id}
                role="link"
                tabIndex={0}
                onClick={() => onRowClick(row.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(row.id)
                  }
                }}
                className={`cursor-pointer border-b border-arctic-100 transition-colors last:border-b-0 hover:bg-arctic-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${
                  isAction ?
                    '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-[#b8410d] [&>td:first-child]:pl-[11px] [&_.case-id]:font-medium [&_.shop-name]:font-medium [&_.question]:font-medium [&_.waiting]:font-medium [&_.waiting]:text-[#b8410d]'
                  : '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-transparent [&>td:first-child]:pl-[11px] [&_.question]:text-onix-600 [&_.shop-name]:text-onix-600'
                }`}
              >
                <td className="case-id px-3.5 py-3.5 font-mono text-[13px] text-onix-950 whitespace-nowrap">
                  {formatConsultCaseId(row.id)}
                </td>
                <td className="px-3.5 py-3.5">
                  <ConsultQueuePill kind={getQueuePill(row)} />
                </td>
                <td className="shop-name px-3.5 py-3.5 whitespace-nowrap text-onix-950">{row.shop?.name ?? '—'}</td>
                <td className="vehicle px-3.5 py-3.5 whitespace-nowrap text-[13px] text-onix-600">
                  {model ?
                    <>
                      <span className="font-medium text-onix-950">{model}</span>
                      {year ? ` · ${year}` : ''}
                    </>
                  : year ?
                    year
                  : '—'}
                </td>
                <td className="ea-question question" title={getQueueQuestionPreview(row)}>
                  {getQueueQuestionPreview(row)}
                </td>
                <td className="waiting px-3.5 py-3.5 font-mono text-[13px] whitespace-nowrap tabular-nums text-onix-950">
                  {formatWaitMinutes(anchor, nowMs)}
                </td>
                <td className="created px-3.5 py-3.5 text-xs whitespace-nowrap text-onix-600">
                  {formatCreatedTime(row.created_at, nowMs)}
                </td>
                <td
                  className={`timer px-3.5 py-3.5 font-mono text-[13px] whitespace-nowrap tabular-nums ${
                    timerState === 'idle' ? 'text-onix-400'
                    : timerState === 'warn' ? 'font-medium text-[#a8501a]'
                    : timerState === 'danger' ? 'font-semibold text-[#9c2a2a]'
                    : 'text-onix-600'
                  }`}
                >
                  {timerSecs === null ? '—' : formatTimerClock(timerSecs)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active ?
          'border-onix-950 bg-onix-950 text-white'
        : 'border-arctic-200 bg-white text-onix-600 hover:border-arctic-300 hover:text-onix-950'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-px font-mono text-[11px] ${
          active ? 'bg-white/20' : 'bg-black/[0.06]'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

export default function ConsultQueueTables({
  pending: initialPending,
  open: initialOpen,
  schemaError,
}: {
  pending: ConsultQueueRow[]
  open: ConsultQueueRow[]
  schemaError?: string | null
}) {
  const router = useRouter()
  const { pending, open, lastUpdated, syncing } = useConsultQueuePoll(initialPending, initialOpen)
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [search, setSearch] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

  const goToCase = (id: string) => router.push(`/consults/${id}`)

  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(tickId)
  }, [])

  const filteredOpen = useMemo(
    () => filterOpenCases(open, filter, search, nowMs),
    [open, filter, search, nowMs]
  )

  const { needResponse, awaitingShop } = useMemo(
    () => partitionOpenCases(filteredOpen),
    [filteredOpen]
  )

  const counts = useMemo(() => {
    const all = partitionOpenCases(open)
    return {
      needResponse: all.needResponse.length,
      awaitingShop: all.awaitingShop.length,
      timer20m: open.filter(r => matchesTimerChip(r, nowMs)).length,
    }
  }, [open, nowMs])

  const chipCounts = useMemo(
    () => ({
      all: open.length,
      need_response: counts.needResponse,
      awaiting_shop: counts.awaitingShop,
      timer_20m: counts.timer20m,
    }),
    [open.length, counts]
  )

  if (schemaError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Consult tables not available</p>
        <p className="mt-1 text-amber-900/90">{schemaError}</p>
        <p className="mt-2 text-xs text-amber-800/90">
          Apply migration <code className="rounded bg-amber-100/80 px-1">040_expert_assist_consults.sql</code> to enable
          this page.
        </p>
      </div>
    )
  }

  return (
    <div className="ea-surface ea-queue mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-arctic-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-onix-950">Expert Assist</h1>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-onix-600">
            {counts.needResponse > 0 ?
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#b8410d] shadow-[0_0_0_0_rgba(184,65,13,0.5)] motion-safe:animate-pulse"
                aria-hidden
              />
            : null}
            <span className="font-mono text-xl font-medium text-[#b8410d]">{counts.needResponse}</span>
            <span className="text-[11px] font-medium uppercase tracking-wider">Need response</span>
          </div>
          <div className="flex items-center gap-2 text-onix-600">
            <span className="font-mono text-xl font-medium text-onix-950">{counts.awaitingShop}</span>
            <span className="text-[11px] font-medium uppercase tracking-wider">Awaiting shop</span>
          </div>
        </div>
      </div>

      {pending.length > 0 ?
        <div className="flex items-center gap-4 rounded-lg border border-[#f0d9b8] bg-[#fff8f0] px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5e0c0] text-[#8a5a1a]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 1.5v2M8 12.5v2M3.5 8h-2M14.5 8h-2M5 5l-1.5-1.5M12.5 12.5L11 11M11 5l1.5-1.5M3.5 12.5L5 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-onix-950">
              {pending.length === 1 ?
                '1 number awaiting shop approval'
              : `${pending.length} numbers awaiting shop approval`}
            </p>
            <p className="text-xs text-onix-600">
              New contacts claimed a shop code. Verify before billing routes activate.
            </p>
          </div>
          <Link
            href={`/consults/${pending[0].id}`}
            className="shrink-0 rounded-md bg-onix-950 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-black"
          >
            Review →
          </Link>
        </div>
      : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={chipCounts.all}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterChip
          label="Need response"
          count={chipCounts.need_response}
          active={filter === 'need_response'}
          onClick={() => setFilter('need_response')}
        />
        <FilterChip
          label="Awaiting shop"
          count={chipCounts.awaiting_shop}
          active={filter === 'awaiting_shop'}
          onClick={() => setFilter('awaiting_shop')}
        />
        <FilterChip
          label="Over 20m timer"
          count={chipCounts.timer_20m}
          active={filter === 'timer_20m'}
          onClick={() => setFilter('timer_20m')}
        />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search shop, case #, VIN…"
          className="ml-auto w-full max-w-[220px] rounded-md border border-arctic-200 bg-white px-2.5 py-1.5 text-xs text-onix-950 placeholder:text-onix-400 sm:w-[220px]"
        />
      </div>

      {filter !== 'awaiting_shop' ?
        <>
          <div className="flex items-baseline gap-2.5 px-1 pt-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#b8410d]">Need response</h2>
            <span className="font-mono text-xs text-onix-400">{needResponse.length}</span>
          </div>
          {needResponse.length === 0 ?
            <p className="rounded-lg border border-dashed border-arctic-300 bg-white px-6 py-6 text-center text-sm text-onix-400">
              Nothing needs your response right now.
            </p>
          : <CaseTable rows={needResponse} variant="action" nowMs={nowMs} onRowClick={goToCase} />}
        </>
      : null}

      {filter !== 'need_response' ?
        <>
          <div className="flex items-baseline gap-2.5 px-1 pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-onix-950">Awaiting shop</h2>
            <span className="font-mono text-xs text-onix-400">{awaitingShop.length}</span>
          </div>
          {awaitingShop.length === 0 ?
            <p className="rounded-lg border border-dashed border-arctic-300 bg-white px-6 py-6 text-center text-sm text-onix-400">
              No cases waiting on the shop.
            </p>
          : <CaseTable rows={awaitingShop} variant="await" nowMs={nowMs} onRowClick={goToCase} />}
        </>
      : null}

      <p className="ea-foot pt-2 text-center text-xs">
        {syncing ? 'Updating… · ' : 'Auto-refresh every 12s · '}
        Last updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>
    </div>
  )
}
