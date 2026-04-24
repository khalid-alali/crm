'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TeslaEnrollmentView } from '@/lib/tesla-enrollments'
import { TESLA_STAGES, type TeslaStage } from '@/lib/program-stage'

const STAGE_LABELS: Record<TeslaStage, string> = {
  not_ready: 'Not Ready',
  getting_ready: 'Getting Ready',
  ready: 'Ready',
  active: 'Active',
  disqualified: 'Disqualified',
}

const STAGE_DOT: Record<TeslaStage, string> = {
  not_ready: 'bg-red-700',
  getting_ready: 'bg-amber-600',
  ready: 'bg-blue-500',
  active: 'bg-green-600',
  disqualified: 'bg-zinc-500',
}

type Props = {
  initialEnrollments: TeslaEnrollmentView[]
}

export default function TeslaBoard({ initialEnrollments }: Props) {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<TeslaEnrollmentView[]>(initialEnrollments)
  const [search, setSearch] = useState('')
  const [county, setCounty] = useState('')
  const [state, setState] = useState('')
  const [shopSurveyOnly, setShopSurveyOnly] = useState(false)
  const [techSurveyOnly, setTechSurveyOnly] = useState(false)
  const [vinfastOnly, setVinfastOnly] = useState(false)
  const [highSignalOnly, setHighSignalOnly] = useState(false)
  const [busyCardId, setBusyCardId] = useState<string | null>(null)
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEnrollments(initialEnrollments)
  }, [initialEnrollments])

  const counties = useMemo(
    () =>
      Array.from(new Set(enrollments.map(r => r.county).filter((c): c is string => Boolean(c)))).sort(),
    [enrollments],
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enrollments.filter(row => {
      if (county && row.county !== county) return false
      if (state && row.state !== state) return false
      if (shopSurveyOnly && !row.hasShopSurvey) return false
      if (techSurveyOnly && !row.hasTechSurvey) return false
      if (vinfastOnly && !row.vinfastActive) return false
      if (highSignalOnly && !row.highSignalName) return false
      if (q) {
        const fields = [row.locationName, row.accountName, row.city, row.state, row.county]
          .map(v => (v ?? '').toLowerCase())
          .join(' ')
        if (!fields.includes(q)) return false
      }
      return true
    })
  }, [
    county,
    highSignalOnly,
    enrollments,
    search,
    shopSurveyOnly,
    state,
    techSurveyOnly,
    vinfastOnly,
  ])

  const grouped = useMemo(() => {
    const byStage: Record<TeslaStage, TeslaEnrollmentView[]> = {
      not_ready: [],
      getting_ready: [],
      ready: [],
      active: [],
      disqualified: [],
    }
    for (const row of filtered) byStage[row.stage].push(row)
    return byStage
  }, [filtered])

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
    const res = await fetch(`/api/tesla/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to update enrollment')
  }

  async function toggleChecklist(
    enrollmentId: string,
    itemKey: string,
    completed: boolean,
    currentNotes: string | null,
  ) {
    const res = await fetch(`/api/tesla/enrollments/${enrollmentId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_key: itemKey,
        completed,
        notes: currentNotes,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to update checklist item')
  }

  function applyOptimisticChecklist(enrollmentId: string, itemKey: string, completed: boolean) {
    const now = new Date().toISOString()
    setEnrollments(prev =>
      prev.map(row => {
        if (row.id !== enrollmentId) return row
        return {
          ...row,
          checklist: row.checklist.map(item =>
            item.itemKey === itemKey ? { ...item, completedAt: completed ? now : null } : item,
          ),
          missingChecklistKeys: completed
            ? row.missingChecklistKeys.filter(k => k !== itemKey)
            : row.missingChecklistKeys.includes(itemKey)
              ? row.missingChecklistKeys
              : [...row.missingChecklistKeys, itemKey],
        }
      }),
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-onix-950">Tesla pipeline</h1>
        <p className="mt-1 text-sm text-onix-500">Can this shop take a job today?</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-onix-600" htmlFor="tesla-county">
          County:
        </label>
        <select
          id="tesla-county"
          value={county}
          onChange={e => setCounty(e.target.value)}
          className="min-w-44 rounded-xl border border-arctic-300 bg-white px-3 py-2 text-sm text-onix-900"
        >
          <option value="">All counties</option>
          {counties.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="text-sm text-onix-600" htmlFor="tesla-state">
          State:
        </label>
        <select
          id="tesla-state"
          value={state}
          onChange={e => setState(e.target.value)}
          className="min-w-44 rounded-xl border border-arctic-300 bg-white px-3 py-2 text-sm text-onix-900"
        >
          <option value="">All states</option>
          {states.map(s => (
            <option key={s.value} value={s.value}>
              {s.value} ({s.count})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-onix-500">Filters:</span>
        <ToggleChip label="Shop survey" active={shopSurveyOnly} onClick={() => setShopSurveyOnly(v => !v)} />
        <ToggleChip label="Tech survey" active={techSurveyOnly} onClick={() => setTechSurveyOnly(v => !v)} />
        <ToggleChip label="VinFast active" active={vinfastOnly} onClick={() => setVinfastOnly(v => !v)} />
        <ToggleChip label="High-signal name" active={highSignalOnly} onClick={() => setHighSignalOnly(v => !v)} />
      </div>

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search shop..."
        className="w-full rounded-xl border border-arctic-300 bg-white px-4 py-2.5 text-sm text-onix-950 placeholder:text-onix-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {TESLA_STAGES.map(stage => (
          <section key={stage} className="rounded-2xl border border-arctic-200 bg-[#f6f4f0] p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-onix-900">
                <span className={`inline-block h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                {STAGE_LABELS[stage]}
              </h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-onix-500">
                {grouped[stage].length}
              </span>
            </header>

            <div className="space-y-3">
              {grouped[stage].map(card => {
                const isBusy = busyCardId === card.id
                const locationLine = [card.city, card.state].filter(Boolean).join(', ')
                const missingKeys = card.missingChecklistKeys
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
                                void withRefresh(
                                  () => updateEnrollment(card.id, { stage: nextStage }),
                                  card.id,
                                )
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
                      {card.county && (
                        <div className="mt-1 inline-flex rounded-md bg-arctic-100 px-1.5 py-0.5 text-xs text-onix-600">
                          {card.county}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {card.tier && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                          {card.tier}
                        </span>
                      )}
                      {card.firstJobCompletedAt && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                          1st job complete
                        </span>
                      )}
                    </div>

                    {stage === 'getting_ready' && (
                      <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                        {card.checklist.map(item => {
                          const checked = Boolean(item.completedAt)
                          return (
                            <label key={item.itemKey} className="flex items-center gap-2 text-xs text-onix-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isBusy}
                                onChange={e => {
                                  const next = e.target.checked
                                  applyOptimisticChecklist(card.id, item.itemKey, next)
                                  void withRefresh(
                                    async () => {
                                      try {
                                        await toggleChecklist(card.id, item.itemKey, next, item.notes)
                                      } catch (err) {
                                        applyOptimisticChecklist(card.id, item.itemKey, !next)
                                        throw err
                                      }
                                    },
                                    card.id,
                                  )
                                }}
                              />
                              {item.label}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    {stage === 'getting_ready' && missingKeys.length > 0 && (
                      <div className="text-xs text-red-700">Missing: {missingKeys.join(', ')}</div>
                    )}

                  </article>
                )
              })}

              {grouped[stage].length === 0 && (
                <div className="rounded-xl border border-dashed border-arctic-300 bg-white px-3 py-6 text-center text-xs text-onix-500">
                  No shops
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
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
