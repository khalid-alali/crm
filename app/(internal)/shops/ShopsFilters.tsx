'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { isBdrAssignee } from '@/lib/bdr-assignees'

interface SearchParams {
  status?: string
  chain?: string
  state?: string
  assigned_to?: string
  program?: string
}

/** Active tab ring/bg aligned with StatusBadge palette */
const statusTabActive: Record<string, string> = {
  lead: 'bg-arctic-100 text-onix-800 border-arctic-300 ring-1 ring-arctic-300',
  contacted: 'bg-brand-100 text-brand-800 border-brand-400 ring-1 ring-brand-300',
  in_review: 'bg-purple-100 text-purple-800 border-purple-400 ring-1 ring-purple-300',
  contracted: 'bg-lime-100 text-lime-800 border-lime-400 ring-1 ring-lime-300',
  active: 'bg-green-100 text-green-800 border-green-400 ring-1 ring-green-300',
  inactive: 'bg-red-100 text-red-800 border-red-400 ring-1 ring-red-300',
}

interface ShopsFiltersProps {
  statuses: string[]
  statusLabels: Record<string, string>
  statusCounts: Record<string, number>
  chains: string[]
  assignees: string[]
  searchParams: SearchParams
}

export default function ShopsFilters({
  statuses,
  statusLabels,
  statusCounts,
  chains,
  assignees,
  searchParams,
}: ShopsFiltersProps) {
  const router = useRouter()

  const [assigneeVal, setAssigneeVal] = useState(() =>
    isBdrAssignee(searchParams.assigned_to) ? searchParams.assigned_to : '',
  )

  const totalLocations = useMemo(
    () => statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0),
    [statuses, statusCounts],
  )

  useEffect(() => {
    setAssigneeVal(isBdrAssignee(searchParams.assigned_to) ? searchParams.assigned_to : '')
  }, [searchParams.assigned_to])

  function applyFilter(params: Partial<SearchParams>) {
    const sp = new URLSearchParams()
    const merged = {
      ...Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v)),
      ...params,
    }

    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v)
    }

    const query = sp.toString()
    const url = query ? `/shops?${query}` : '/shops'
    router.push(url)
    // Search-param-only navigations can reuse a stale RSC tree; refresh refetches the server page.
    router.refresh()
  }

  const statusTabIdle =
    'border border-arctic-200 bg-white text-onix-600 hover:bg-arctic-50 hover:border-arctic-300'
  const allTabActive = 'bg-slate-800 text-white border-slate-800 ring-1 ring-slate-700'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => applyFilter({ status: undefined })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
            !searchParams.status ? allTabActive : statusTabIdle
          }`}
        >
          All {totalLocations}
        </button>
        {statuses.map(s => {
          const active = searchParams.status === s
          const activeCls = statusTabActive[s] ?? statusTabActive.lead
          return (
            <button
              key={s}
              type="button"
              onClick={() => applyFilter({ status: s })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
                  active ? activeCls : statusTabIdle
                }`}
              >
                {statusLabels[s]} {statusCounts[s] ?? 0}
              </button>
            )
          })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={assigneeVal}
          onChange={e => {
            const raw = e.target.value
            setAssigneeVal(raw)
            applyFilter({ assigned_to: raw || undefined })
          }}
          className="rounded-xl border border-arctic-300 bg-white px-3 py-2 text-sm text-onix-800"
        >
          <option value="">All assignees</option>
          {assignees.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {chains.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chains.map(chain => {
              const active = searchParams.chain === chain
              return (
                <button
                  key={chain}
                  type="button"
                  onClick={() => applyFilter({ chain: active ? undefined : chain })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-onix-600 border-arctic-300 hover:bg-arctic-50'
                  }`}
                >
                  {chain}
                </button>
              )
            })}
          </div>
        )}

        {Object.values(searchParams).some(Boolean) && (
          <Link
            href="/shops"
            className="px-3 py-1.5 text-xs font-medium text-onix-600 hover:text-onix-800 underline"
          >
            Clear filters
          </Link>
        )}
      </div>
    </div>
  )
}
