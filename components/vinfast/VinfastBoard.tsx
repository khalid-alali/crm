'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MapView, { type MapViewLocation } from '@/app/(internal)/map/MapView'
import type { VinfastEnrollmentView } from '@/lib/vinfast-enrollments'
import { TESLA_STAGES, type TeslaStage } from '@/lib/program-stage'

const STAGE_LABELS: Record<TeslaStage, string> = {
  not_ready: 'Labor rate approval',
  getting_ready: 'Setup, training & equipment',
  ready: 'Ready for activation',
  active: 'Active',
  disqualified: 'Archived',
}

const STAGE_DOT: Record<TeslaStage, string> = {
  not_ready: 'bg-red-700',
  getting_ready: 'bg-amber-600',
  ready: 'bg-blue-500',
  active: 'bg-green-600',
  disqualified: 'bg-zinc-500',
}

const MAIN_KANBAN_STAGES: TeslaStage[] = ['not_ready', 'getting_ready', 'ready', 'active']

type ViewMode = 'kanban' | 'map' | 'table'
type CompletionFilter = 'all' | 'complete' | 'incomplete'
type BooleanFilter = 'all' | 'true' | 'false'

type Props = {
  initialEnrollments: VinfastEnrollmentView[]
  mapLocations: MapViewLocation[]
  allLocations: Array<{ id: string; name: string; city: string | null; state: string | null }>
}

export default function VinfastBoard({ initialEnrollments, mapLocations, allLocations }: Props) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [enrollments, setEnrollments] = useState<VinfastEnrollmentView[]>(initialEnrollments)
  const [search, setSearch] = useState('')
  const [county, setCounty] = useState('')
  const [state, setState] = useState('')
  const [shopSurveyFilter, setShopSurveyFilter] = useState<CompletionFilter>('all')
  const [techSurveyFilter, setTechSurveyFilter] = useState<CompletionFilter>('all')
  const [vinfastActiveFilter, setVinfastActiveFilter] = useState<BooleanFilter>('all')
  const [highSignalOnly, setHighSignalOnly] = useState(false)
  const [busyCardId, setBusyCardId] = useState<string | null>(null)
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null)
  const [dqPanelOpen, setDqPanelOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addShopOpen, setAddShopOpen] = useState(false)
  const [addShopQuery, setAddShopQuery] = useState('')
  const [addShopBusyId, setAddShopBusyId] = useState<string | null>(null)

  useEffect(() => {
    setEnrollments(initialEnrollments)
  }, [initialEnrollments])

  const mapByLocationId = useMemo(
    () => new Map(mapLocations.map(location => [location.id, location])),
    [mapLocations],
  )

  const states = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of enrollments) {
      const key = (row.state ?? '').trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
      .map(([value, count]) => ({ value, count }))
  }, [enrollments])

  const counties = useMemo(() => {
    const rows = state
      ? enrollments.filter(r => (r.state ?? '').trim() === state)
      : enrollments
    const counts = new Map<string, number>()
    for (const row of rows) {
      const countyValue = (mapByLocationId.get(row.locationId)?.county ?? '').trim()
      if (!countyValue) continue
      counts.set(countyValue, (counts.get(countyValue) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
      .map(([value, count]) => ({ value, count }))
  }, [enrollments, mapByLocationId, state])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enrollments.filter(row => {
      const locationMeta = mapByLocationId.get(row.locationId)
      const countyValue = locationMeta?.county ?? ''
      if (county && countyValue !== county) return false
      if (state && row.state !== state) return false
      if (shopSurveyFilter === 'complete' && !row.hasShopSurvey) return false
      if (shopSurveyFilter === 'incomplete' && row.hasShopSurvey) return false
      if (techSurveyFilter === 'complete' && !row.hasTechSurvey) return false
      if (techSurveyFilter === 'incomplete' && row.hasTechSurvey) return false
      if (vinfastActiveFilter === 'true' && !row.vinfastActive) return false
      if (vinfastActiveFilter === 'false' && row.vinfastActive) return false
      if (highSignalOnly && !row.highSignalName) return false
      if (q) {
        const fields = [row.locationName, row.accountName, row.city, row.state, countyValue]
          .map(v => (v ?? '').toLowerCase())
          .join(' ')
        if (!fields.includes(q)) return false
      }
      return true
    })
  }, [
    county,
    enrollments,
    highSignalOnly,
    mapByLocationId,
    search,
    shopSurveyFilter,
    state,
    techSurveyFilter,
    vinfastActiveFilter,
  ])

  const filteredLocationIds = useMemo(() => new Set(filtered.map(e => e.locationId)), [filtered])

  const mapLocationsForView = useMemo(
    () => mapLocations.filter(l => filteredLocationIds.has(l.id)),
    [mapLocations, filteredLocationIds],
  )

  const vinfastStageByLocationId = useMemo(
    () => Object.fromEntries(filtered.map(e => [e.locationId, e.stage])),
    [filtered],
  )

  const grouped = useMemo(() => {
    const byStage: Record<TeslaStage, VinfastEnrollmentView[]> = {
      not_ready: [],
      getting_ready: [],
      ready: [],
      active: [],
      disqualified: [],
    }
    for (const row of filtered) {
      const stage = TESLA_STAGES.includes(row.stage as TeslaStage) ? (row.stage as TeslaStage) : 'not_ready'
      byStage[stage].push(row)
    }
    return byStage
  }, [filtered])

  const enrolledLocationIds = useMemo(() => new Set(enrollments.map(e => e.locationId)), [enrollments])
  const enrollableLocations = useMemo(() => {
    const q = addShopQuery.trim().toLowerCase()
    return allLocations
      .filter(loc => !enrolledLocationIds.has(loc.id))
      .filter(loc => {
        if (!q) return true
        const text = [loc.name, loc.city, loc.state].filter(Boolean).join(' ').toLowerCase()
        return text.includes(q)
      })
      .slice(0, 30)
  }, [addShopQuery, allLocations, enrolledLocationIds])

  async function withRefresh(task: () => Promise<void>, enrollmentId: string) {
    setBusyCardId(enrollmentId)
    setError(null)
    try {
      await task()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyCardId(null)
    }
  }

  async function updateEnrollment(enrollmentId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/vinfast/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to update enrollment')
  }

  async function enrollLocation(locationId: string) {
    setAddShopBusyId(locationId)
    setError(null)
    try {
      const res = await fetch('/api/vinfast/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not enroll location')
      setAddShopOpen(false)
      setAddShopQuery('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enroll location')
    } finally {
      setAddShopBusyId(null)
    }
  }

  function clearAllFilters() {
    setShopSurveyFilter('all')
    setTechSurveyFilter('all')
    setVinfastActiveFilter('all')
    setHighSignalOnly(false)
  }

  function renderKanbanColumn(stage: TeslaStage, opts?: { hideHeader?: boolean }) {
    const cards = grouped[stage]
    const hideHeader = opts?.hideHeader ?? false
    return (
      <section key={stage} className="rounded-2xl border border-arctic-200 bg-[#f6f4f0] p-3">
        {!hideHeader && (
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-onix-900">
              <span className={`inline-block h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
              {STAGE_LABELS[stage]}
            </h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-onix-500">
              {cards.length}
            </span>
          </header>
        )}

        <div className="space-y-3">
          {cards.map(card => {
            const isBusy = busyCardId === card.id
            const locationLine = [card.city, card.state].filter(Boolean).join(', ')
            const countyValue = mapByLocationId.get(card.locationId)?.county
            return (
              <article
                key={card.id}
                className="space-y-2 rounded-xl border border-arctic-300 bg-white p-3 cursor-pointer"
                onClick={() => router.push(`/shops/${card.locationId}`)}
              >
                <div className="relative">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={e => {
                      e.stopPropagation()
                      setOpenMenuCardId(prev => (prev === card.id ? null : card.id))
                    }}
                    className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-onix-600 hover:bg-arctic-50 disabled:opacity-50"
                    aria-label="Card actions"
                  >
                    ...
                  </button>

                  {openMenuCardId === card.id && (
                    <div
                      className="absolute right-0 top-8 z-20 min-w-40 rounded-md border border-arctic-300 bg-white p-1 shadow-lg"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      {TESLA_STAGES.map(nextStage => (
                        <button
                          key={nextStage}
                          type="button"
                          disabled={isBusy}
                          onClick={e => {
                            e.stopPropagation()
                            setOpenMenuCardId(null)
                            void withRefresh(() => updateEnrollment(card.id, { stage: nextStage }), card.id)
                          }}
                          className={`block w-full rounded px-2 py-1 text-left text-xs ${
                            card.stage === nextStage
                              ? 'bg-arctic-100 font-semibold text-onix-900'
                              : 'text-onix-700 hover:bg-arctic-50'
                          }`}
                        >
                          {STAGE_LABELS[nextStage]}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pr-8 text-[18px] font-semibold leading-tight text-onix-950">
                    {card.locationName}
                  </div>
                  <div className="text-sm text-onix-600">{locationLine || 'Location unknown'}</div>
                  {countyValue && (
                    <div className="mt-1 inline-flex rounded-md bg-arctic-100 px-1.5 py-0.5 text-xs text-onix-600">
                      {countyValue}
                    </div>
                  )}
                </div>
              </article>
            )
          })}

          {cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-arctic-300 bg-white px-3 py-6 text-center text-xs text-onix-500">
              No shops
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-onix-950">VinFast pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddShopOpen(true)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add shop
          </button>
          <div
            className="inline-flex shrink-0 rounded-lg border border-arctic-300 bg-arctic-50 p-1"
            role="group"
            aria-label="View mode"
          >
            {(
              [
                { id: 'kanban' as const, label: 'Kanban' },
                { id: 'map' as const, label: 'Map' },
                { id: 'table' as const, label: 'Table' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === id
                    ? 'bg-white text-onix-950 shadow-sm'
                    : 'text-onix-600 hover:text-onix-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-onix-600" htmlFor="vinfast-state">
          State:
        </label>
        <select
          id="vinfast-state"
          value={state}
          onChange={e => {
            const next = e.target.value
            setState(next)
            setCounty(prev => {
              if (!next) return prev
              const stillValid = enrollments.some(r => {
                const rowCounty = (mapByLocationId.get(r.locationId)?.county ?? '').trim()
                return (r.state ?? '').trim() === next && rowCounty === prev
              })
              return stillValid ? prev : ''
            })
          }}
          className="min-w-44 rounded-xl border border-arctic-300 bg-white px-3 py-2 text-sm text-onix-900"
        >
          <option value="">All states</option>
          {states.map(s => (
            <option key={s.value} value={s.value}>
              {s.value} ({s.count})
            </option>
          ))}
        </select>

        <label className="text-sm text-onix-600" htmlFor="vinfast-county">
          County:
        </label>
        <select
          id="vinfast-county"
          value={county}
          onChange={e => setCounty(e.target.value)}
          className="min-w-44 rounded-xl border border-arctic-300 bg-white px-3 py-2 text-sm text-onix-900"
        >
          <option value="">{state ? 'All counties in state' : 'All counties'}</option>
          {counties.map(c => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-onix-500">Filters:</span>
        <FilterSelect
          id="vinfast-shop-survey-filter"
          label="Shop survey"
          value={shopSurveyFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'complete', label: 'Complete' },
            { value: 'incomplete', label: 'Incomplete' },
          ]}
          onChange={value => setShopSurveyFilter(value as CompletionFilter)}
          onClear={() => setShopSurveyFilter('all')}
        />
        <FilterSelect
          id="vinfast-tech-survey-filter"
          label="Tech survey"
          value={techSurveyFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'complete', label: 'Complete' },
            { value: 'incomplete', label: 'Incomplete' },
          ]}
          onChange={value => setTechSurveyFilter(value as CompletionFilter)}
          onClear={() => setTechSurveyFilter('all')}
        />
        <FilterSelect
          id="vinfast-active-filter"
          label="VinFast active"
          value={vinfastActiveFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
          onChange={value => setVinfastActiveFilter(value as BooleanFilter)}
          onClear={() => setVinfastActiveFilter('all')}
        />
        <ToggleChip label="High-signal name" active={highSignalOnly} onClick={() => setHighSignalOnly(v => !v)} />
        <button
          type="button"
          onClick={clearAllFilters}
          className="rounded-full border border-arctic-300 bg-white px-3 py-1 text-sm text-onix-700 hover:bg-arctic-50"
        >
          Clear filters
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search shop..."
        className="w-full rounded-xl border border-arctic-300 bg-white px-4 py-2.5 text-sm text-onix-950 placeholder:text-onix-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {viewMode === 'map' && (
        <div className="overflow-hidden rounded-xl border border-arctic-200 bg-white">
          <div className="flex h-[min(720px,calc(100vh-280px))] min-h-[420px] w-full flex-col">
            <MapView
              locations={mapLocationsForView}
              teslaEmbed
              teslaStageByLocationId={vinfastStageByLocationId}
              teslaSelectedState={state}
              teslaSelectedCounty={county}
            />
          </div>
        </div>
      )}

      {viewMode === 'table' && (
        <div className="overflow-hidden rounded-xl border border-arctic-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-arctic-50 text-left text-xs uppercase tracking-wide text-onix-500">
              <tr>
                <th className="px-3 py-2">Shop</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">County</th>
                <th className="px-3 py-2">Stage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} className="border-t border-arctic-100">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/shops/${row.locationId}`)}
                      className="font-medium text-onix-900 hover:underline"
                    >
                      {row.locationName}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-onix-600">{[row.city, row.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-onix-600">{mapByLocationId.get(row.locationId)?.county ?? '—'}</td>
                  <td className="px-3 py-2 text-onix-700">
                    {STAGE_LABELS[
                      TESLA_STAGES.includes(row.stage as TeslaStage) ? (row.stage as TeslaStage) : 'not_ready'
                    ]}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-onix-500" colSpan={4}>
                    No shops match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'kanban' && (
        <>
          <div className="flex min-h-[min(520px,50vh)] flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {MAIN_KANBAN_STAGES.map(stage => renderKanbanColumn(stage))}
            </div>

            <button
              type="button"
              id="vinfast-dq-rail"
              aria-expanded={dqPanelOpen}
              aria-controls="vinfast-dq-panel"
              onClick={() => setDqPanelOpen(true)}
              className="flex shrink-0 flex-row items-center justify-center gap-2 rounded-l-xl border border-arctic-300 border-r-0 bg-zinc-100 py-3 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-200 lg:w-11 lg:flex-col lg:justify-start lg:gap-3 lg:py-6 lg:pl-1 lg:pr-0"
              title="Disqualified — click to open"
            >
              <span className={`hidden rounded-full lg:inline-block h-2 w-2 shrink-0 ${STAGE_DOT.disqualified}`} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600 lg:[writing-mode:vertical-rl] lg:rotate-180">
                ARCHIVED
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-300">
                {grouped.disqualified.length}
              </span>
            </button>
          </div>

          {dqPanelOpen && (
            <>
              <button
                type="button"
                aria-label="Close disqualified panel"
                className="fixed inset-0 z-40 cursor-default bg-black/35"
                onClick={() => setDqPanelOpen(false)}
              />
              <aside
                id="vinfast-dq-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vinfast-dq-panel-title"
                className="fixed right-0 top-0 z-50 flex h-full w-[min(440px,100vw)] flex-col border-l border-arctic-200 bg-[#f6f4f0] shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-arctic-200 bg-white px-4 py-3">
                  <h2
                    id="vinfast-dq-panel-title"
                    className="flex items-center gap-2 text-lg font-semibold text-onix-900"
                  >
                    <span className={`inline-block h-2 w-2 rounded-full ${STAGE_DOT.disqualified}`} />
                    {STAGE_LABELS.disqualified}
                    <span className="rounded-full bg-arctic-100 px-2 py-0.5 text-xs font-semibold text-onix-600">
                      {grouped.disqualified.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setDqPanelOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-onix-600 hover:bg-arctic-100"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">{renderKanbanColumn('disqualified', { hideHeader: true })}</div>
              </aside>
            </>
          )}
        </>
      )}

      {addShopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl border border-arctic-200 bg-white shadow-xl">
            <div className="border-b border-arctic-200 px-4 py-3">
              <h2 className="text-base font-semibold text-onix-900">Enroll shop in VinFast</h2>
            </div>
            <div className="space-y-3 p-4">
              <input
                type="search"
                value={addShopQuery}
                onChange={e => setAddShopQuery(e.target.value)}
                placeholder="Search shop name, city, state..."
                className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm"
              />
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {enrollableLocations.map(loc => (
                  <button
                    key={loc.id}
                    type="button"
                    disabled={addShopBusyId === loc.id}
                    onClick={() => void enrollLocation(loc.id)}
                    className="block w-full rounded-lg border border-arctic-200 px-3 py-2 text-left hover:bg-arctic-50 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-onix-900">{loc.name}</div>
                    <div className="text-xs text-onix-500">{[loc.city, loc.state].filter(Boolean).join(', ') || '—'}</div>
                  </button>
                ))}
                {enrollableLocations.length === 0 && (
                  <p className="rounded border border-dashed border-arctic-300 px-3 py-4 text-center text-sm text-onix-500">
                    No matching unenrolled shops.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end border-t border-arctic-200 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setAddShopOpen(false)
                  setAddShopQuery('')
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-onix-600 hover:bg-arctic-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? 'border-slate-800 bg-slate-800 text-white'
          : 'border-arctic-300 bg-white text-onix-700 hover:bg-arctic-50'
      }`}
    >
      {label}
    </button>
  )
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  onClear,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  onClear: () => void
}) {
  const isActive = value !== 'all'
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm text-onix-700">{label}</span>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`min-w-[120px] rounded-full border px-3 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          isActive
            ? 'border-slate-800 bg-slate-800 text-white'
            : 'border-arctic-300 bg-white text-onix-700 hover:bg-arctic-50'
        }`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {value !== 'all' && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-800 bg-slate-800 text-xs text-white hover:bg-slate-700"
          aria-label={`Clear ${label} filter`}
          title={`Clear ${label} filter`}
        >
          ×
        </button>
      )}
    </div>
  )
}
