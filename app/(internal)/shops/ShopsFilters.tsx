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
  lead: 'bg-gray-100 text-gray-800 border-gray-400 ring-1 ring-gray-400',
  contacted: 'bg-blue-100 text-blue-800 border-blue-400 ring-1 ring-blue-300',
  in_review: 'bg-purple-100 text-purple-800 border-purple-400 ring-1 ring-purple-300',
  contracted: 'bg-yellow-100 text-yellow-800 border-amber-400 ring-1 ring-amber-300',
  active: 'bg-green-100 text-green-800 border-green-400 ring-1 ring-green-300',
  inactive: 'bg-red-100 text-red-800 border-red-400 ring-1 ring-red-300',
}

interface ShopsFiltersProps {
  statuses: string[]
  statusLabels: Record<string, string>
  statusCounts: Record<string, number>
  chains: string[]
  states: string[]
  assignees: string[]
  searchParams: SearchParams
}

export default function ShopsFilters({
  statuses,
  statusLabels,
  statusCounts,
  chains,
  states,
  assignees,
  searchParams,
}: ShopsFiltersProps) {
  const router = useRouter()

  const [stateVal, setStateVal] = useState(() => searchParams.state ?? '')
  const [assigneeVal, setAssigneeVal] = useState(() =>
    isBdrAssignee(searchParams.assigned_to) ? searchParams.assigned_to : '',
  )

  const totalLocations = useMemo(
    () => statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0),
    [statuses, statusCounts],
  )

  useEffect(() => {
    setStateVal(searchParams.state ?? '')
    setAssigneeVal(isBdrAssignee(searchParams.assigned_to) ? searchParams.assigned_to : '')
  }, [searchParams.state, searchParams.assigned_to])

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
    'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300'
  const allTabActive = 'bg-slate-800 text-white border-slate-800 ring-1 ring-slate-700'

  return (
    <div className="mb-4 space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex flex-wrap gap-x-3 gap-y-2 items-center text-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => applyFilter({ status: undefined })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                !searchParams.status ? allTabActive : statusTabIdle
              }`}
            >
              All{totalLocations > 0 ? ` (${totalLocations})` : ''}
            </button>
            {statuses.map(s => {
              const active = searchParams.status === s
              const activeCls = statusTabActive[s] ?? statusTabActive.lead
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => applyFilter({ status: s })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                    active ? activeCls : statusTabIdle
                  }`}
                >
                  {statusLabels[s]} ({statusCounts[s] ?? 0})
                </button>
              )
            })}
          </div>

          {chains.length > 0 && (
            <>
              <div className="hidden sm:block w-px h-6 bg-gray-200 shrink-0 self-center" aria-hidden />
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide pr-1">
                  Chains
                </span>
                {chains.map(chain => {
                  const active = searchParams.chain === chain
                  return (
                    <button
                      key={chain}
                      type="button"
                      onClick={() =>
                        applyFilter({ chain: active ? undefined : chain })
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-orange-100 text-orange-900 border-orange-400 ring-1 ring-orange-300'
                          : 'bg-orange-50/80 text-orange-800 border-orange-200 hover:bg-orange-100 hover:border-orange-300'
                      }`}
                    >
                      {chain}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
      <div>
        <select
          value={stateVal}
          onChange={e => {
            const raw = e.target.value
            setStateVal(raw)
            applyFilter({ state: raw || undefined })
          }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All states</option>
          {states.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <select
          value={assigneeVal}
          onChange={e => {
            const raw = e.target.value
            setAssigneeVal(raw)
            applyFilter({ assigned_to: raw || undefined })
          }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All assignees</option>
          {assignees.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {Object.values(searchParams).some(Boolean) && (
        <Link href="/shops" className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 underline">
          Clear filters
        </Link>
      )}
      </div>
    </div>
  )
}
