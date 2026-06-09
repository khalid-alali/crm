'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ExpertAssistEnrollSearchModal from '@/components/expert-assist/ExpertAssistEnrollSearchModal'
import {
  EXPERT_ASSIST_FUNNEL_STAGES,
  type ExpertAssistFunnelStage,
} from '@/lib/expert-assist-funnel/stages'
import type { ExpertAssistEnrollmentView } from '@/lib/expert-assist-enrollments'
import { UserPlus } from 'lucide-react'

const STAGE_LABELS: Record<ExpertAssistFunnelStage, string> = {
  invited: 'Invited',
  signed_up: 'Signed Up',
  engaged: 'Engaged',
  activated: 'Activated',
  active: 'Active',
  dormant: 'Dormant',
}

const STAGE_DOT: Record<ExpertAssistFunnelStage, string> = {
  invited: 'bg-sky-500',
  signed_up: 'bg-violet-500',
  engaged: 'bg-amber-600',
  activated: 'bg-blue-500',
  active: 'bg-green-600',
  dormant: 'bg-zinc-500',
}

type Props = {
  initialEnrollments: ExpertAssistEnrollmentView[]
}

export default function ConsultActivationBoard({ initialEnrollments }: Props) {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState(initialEnrollments)
  const [search, setSearch] = useState('')
  const [busyCardId, setBusyCardId] = useState<string | null>(null)
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrollShopModalOpen, setEnrollShopModalOpen] = useState(false)
  const [enrollBusyLocationId, setEnrollBusyLocationId] = useState<string | null>(null)

  useEffect(() => {
    setEnrollments(initialEnrollments)
  }, [initialEnrollments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enrollments
    return enrollments.filter(row => {
      const fields = [row.locationName, row.accountName, row.city, row.state, row.county]
        .map(v => (v ?? '').toLowerCase())
        .join(' ')
      return fields.includes(q)
    })
  }, [enrollments, search])

  const grouped = useMemo(() => {
    const byStage = Object.fromEntries(
      EXPERT_ASSIST_FUNNEL_STAGES.map(stage => [stage, [] as ExpertAssistEnrollmentView[]]),
    ) as Record<ExpertAssistFunnelStage, ExpertAssistEnrollmentView[]>
    for (const row of filtered) {
      const stage = EXPERT_ASSIST_FUNNEL_STAGES.includes(row.stage) ? row.stage : 'invited'
      byStage[stage].push(row)
    }
    return byStage
  }, [filtered])

  const enrolledLocationIds = useMemo(() => new Set(enrollments.map(e => e.locationId)), [enrollments])

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
    const res = await fetch(`/api/expert-assist/enrollments/${enrollmentId}`, {
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
    const res = await fetch(`/api/expert-assist/enrollments/${enrollmentId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_key: itemKey,
        completed,
        notes: currentNotes,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Checklist update failed')
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
        }
      }),
    )
  }

  async function enrollLocation(locationId: string) {
    setEnrollBusyLocationId(locationId)
    setError(null)
    try {
      const res = await fetch('/api/expert-assist/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not enroll location')
      setEnrollShopModalOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enroll location')
    } finally {
      setEnrollBusyLocationId(null)
    }
  }

  function renderKanbanColumn(stage: ExpertAssistFunnelStage) {
    const cards = grouped[stage]
    return (
      <section key={stage} className="rounded-2xl border border-arctic-200 bg-[#f6f4f0] p-3">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-onix-900">
            <span className={`inline-block h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
            {STAGE_LABELS[stage]}
          </h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-onix-500">
            {cards.length}
          </span>
        </header>

        <div className="space-y-3">
          {cards.map(card => {
            const isBusy = busyCardId === card.id
            const locationLine = [card.city, card.state].filter(Boolean).join(', ')
            return (
              <article
                key={card.id}
                className="space-y-2 rounded-xl border border-arctic-300 bg-white p-3 cursor-pointer"
                onClick={() => router.push(`/shops/${card.locationId}?tab=expert-assist`)}
              >
                <div className="relative pr-8">
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
                    …
                  </button>

                  {openMenuCardId === card.id && (
                    <div
                      className="absolute right-0 top-8 z-20 min-w-48 rounded-md border border-arctic-300 bg-white p-1 shadow-lg"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-onix-400">
                        Move to stage
                      </p>
                      {EXPERT_ASSIST_FUNNEL_STAGES.map(nextStage => (
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
                      {card.manualStageOverride && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={e => {
                            e.stopPropagation()
                            setOpenMenuCardId(null)
                            void withRefresh(
                              () => updateEnrollment(card.id, { manual_stage_override: false }),
                              card.id,
                            )
                          }}
                          className="mt-1 block w-full rounded border-t border-arctic-100 px-2 py-1.5 text-left text-xs text-brand-700 hover:bg-arctic-50"
                        >
                          Clear manual override
                        </button>
                      )}
                    </div>
                  )}

                  <p className="font-semibold text-onix-900">{card.locationName}</p>
                  {locationLine ? <p className="text-xs text-onix-500">{locationLine}</p> : null}
                  {card.manualStageOverride ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      Manual stage
                    </p>
                  ) : null}
                </div>

                <div
                  className="space-y-1 border-t border-arctic-100 pt-2"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {card.checklist.map(item => (
                    <label
                      key={item.itemKey}
                      className="flex cursor-pointer items-start gap-2 text-xs text-onix-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(item.completedAt)}
                        disabled={isBusy || item.readOnly}
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
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </article>
            )
          })}
          {cards.length === 0 && (
            <p className="rounded-lg border border-dashed border-arctic-300 bg-white/60 px-3 py-6 text-center text-xs text-onix-500">
              No shops
            </p>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-onix-600">
          Track shop activation from invite through repeat consult usage.
        </p>
        <button
          type="button"
          onClick={() => setEnrollShopModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Add shop
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search shop..."
        className="w-full rounded-xl border border-arctic-300 bg-white px-4 py-2.5 text-sm text-onix-950 placeholder:text-onix-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {EXPERT_ASSIST_FUNNEL_STAGES.map(stage => renderKanbanColumn(stage))}
      </div>

      <ExpertAssistEnrollSearchModal
        open={enrollShopModalOpen}
        onClose={() => setEnrollShopModalOpen(false)}
        enrolledLocationIds={enrolledLocationIds}
        enrollingLocationId={enrollBusyLocationId}
        onEnroll={enrollLocation}
        errorMessage={error}
      />
    </div>
  )
}
