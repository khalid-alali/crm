'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Clock, ExternalLink, Loader2, Lock } from 'lucide-react'

type ItemLink = { label: string; url: string; primary?: boolean }

// Mirrors the GET /api/portal/[token]/checklist response.
type Item = {
  key: string
  label: string
  owner: 'fl' | 'vf' | 'shop'
  side: 'shop' | 'fixlane'
  completable: boolean
  optional: boolean
  explainer?: string
  note?: string
  spec?: [string, string][]
  links?: ItemLink[]
  phase?: number
  phaseLabel?: string
  completedAt: string | null
  blocked: boolean
  unlocksAfterLabel: string | null
}
type SurveyItem = {
  key: 'capabilities' | 'site' | 'technicians'
  label: string
  status: 'not_started' | 'in_progress' | 'submitted'
  detail: string
  href: string
  cta: string
}
type Program = {
  enrollment_id: string
  program_id: string
  program_label: string
  stage: string
  help_email: string
  surveys?: SurveyItem[]
  items: Item[]
}

const VIOLET = '#687cf9'
const MUTED = 'text-[#5f6571]'
const HAIR = 'border-[#0f1114]/10'

type PhaseGroup = { phase: number | null; label: string; items: Item[]; done: boolean }

function groupByPhase(items: Item[]): PhaseGroup[] {
  const groups: PhaseGroup[] = []
  for (const it of items) {
    const phase = it.phase ?? null
    let g = groups.find(x => x.phase === phase)
    if (!g) {
      g = { phase, label: it.phaseLabel ?? '', items: [], done: true }
      groups.push(g)
    }
    g.items.push(it)
    if (!it.completedAt) g.done = false
  }
  return groups
}

function ProgressRing({ pct, active }: { pct: number; active: boolean }) {
  if (pct >= 100) {
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#cfffcd] text-[#1f6b2e]">
        <Check size={12} strokeWidth={3} aria-hidden />
      </span>
    )
  }
  return (
    <span
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[8px] font-semibold ${
        active ? 'border-[#687cf9] text-[#687cf9]' : 'border-[#d7dade] text-[#5f6571]'
      }`}
    >
      {pct}%
    </span>
  )
}

// The progress denominator is the shop's OWN required steps: Fixlane-handled
// rows and shop-optional steps (e.g. Tesla Toolbox) are shown but never block
// reaching 100%.
function countedItems(items: Item[]): Item[] {
  return items.filter(i => i.side === 'shop' && !i.optional)
}

function programPct(p: Program): number {
  const counted = countedItems(p.items)
  if (counted.length === 0) return p.stage === 'active' ? 100 : 0
  const done = counted.filter(i => i.completedAt).length
  return Math.round((done / counted.length) * 100)
}

const OWNER_CHIP: Record<Item['owner'], { label: string; cls: string }> = {
  shop: { label: 'You', cls: 'bg-[#687cf9]/10 text-[#3f47c4]' },
  fl: { label: 'Fixlane', cls: 'bg-[#eef0f3] text-[#5f6571]' },
  vf: { label: 'VinFast', cls: 'bg-amber-50 text-amber-700' },
}

export default function PortalOnboardingClient({ token }: { token: string }) {
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/portal/${token}/checklist`)
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || (res.status === 401 ? 'This link has expired.' : 'Something went wrong.'))
        }
        return res.json()
      })
      .then((data: { programs: Program[] }) => {
        if (cancelled) return
        setPrograms(data.programs)
        setSelected(data.programs[0]?.enrollment_id ?? null)
      })
      .catch(e => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [token])

  const current = useMemo(
    () => programs?.find(p => p.enrollment_id === selected) ?? programs?.[0] ?? null,
    [programs, selected],
  )

  async function complete(item: Item, program: Program) {
    setSaving(item.key)
    try {
      const res = await fetch(`/api/portal/${token}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: program.enrollment_id, item_key: item.key, completed: true }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Could not update')
      setPrograms(prev =>
        (prev ?? []).map(p =>
          p.enrollment_id !== program.enrollment_id
            ? p
            : { ...p, items: p.items.map(it => (it.key === item.key ? { ...it, completedAt: j.completed_at } : it)) },
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update')
    } finally {
      setSaving(null)
    }
  }

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="text-xl font-semibold text-[#0f1114]">{error}</h1>
          <p className={`mt-2 text-sm ${MUTED}`}>
            Contact our onboarding team at{' '}
            <a href="mailto:shops@fixlane.com" className="text-[#687cf9]">
              shops@fixlane.com
            </a>{' '}
            for a new link.
          </p>
        </div>
      </Shell>
    )
  }

  if (programs === null) {
    return (
      <Shell>
        <div className="flex items-center gap-2 py-24 text-[#5f6571]">
          <Loader2 className="animate-spin" size={18} aria-hidden /> Loading your onboarding…
        </div>
      </Shell>
    )
  }

  if (programs.length === 0 || !current) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <Clock className="mx-auto text-[#687cf9]" size={26} aria-hidden />
          <h1 className="mt-3 text-xl font-semibold text-[#0f1114]">Nothing to set up yet</h1>
          <p className={`mt-2 text-sm ${MUTED}`}>
            You're all set for now. When Fixlane adds you to a program, your onboarding
            steps show up here — and we'll email you.
          </p>
          <p className={`mt-3 text-xs ${MUTED}`}>
            Questions? <a href="mailto:shops@fixlane.com" className="text-[#687cf9]">shops@fixlane.com</a>
          </p>
        </div>
      </Shell>
    )
  }

  const phases = groupByPhase(current.items)
  const hasPhases = phases.some(g => g.phase !== null)
  const phasedGroups = phases.filter(g => g.phase !== null)
  // Shop-centric "current phase": the earliest phase with a step the shop can act on now.
  const shopActionPhaseIdx = phasedGroups.findIndex(g =>
    g.items.some(it => it.completable && !it.completedAt && !it.blocked),
  )
  const currentPhaseNum = shopActionPhaseIdx >= 0 ? phasedGroups[shopActionPhaseIdx].phase : null
  const counted = countedItems(current.items)
  const totalDone = counted.filter(i => i.completedAt).length
  const totalCounted = counted.length
  const allDone = totalDone === totalCounted
  const pct = programPct(current)

  return (
    <Shell>
      <div className="flex flex-col md:flex-row">
        {/* Sidebar / program switcher */}
        <aside className={`border-b ${HAIR} p-5 md:w-60 md:flex-none md:border-b-0 md:border-r`}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f1114] text-sm font-bold text-white">
              F
            </span>
            <span className="font-semibold text-[#0f1114]">Fixlane</span>
          </div>
          <p className={`mt-6 text-[11px] font-medium uppercase tracking-wider ${MUTED}`}>Programs</p>
          <nav className="mt-3 flex gap-2 overflow-x-auto md:flex-col md:gap-1" aria-label="Programs">
            {programs.map(p => {
              const isSel = p.enrollment_id === current.enrollment_id
              return (
                <button
                  key={p.enrollment_id}
                  onClick={() => setSelected(p.enrollment_id)}
                  aria-current={isSel}
                  className={`flex flex-none items-center gap-2.5 rounded-lg border px-3 py-2 text-left md:border-0 ${
                    isSel ? 'bg-[#687cf9]/8 md:bg-[#687cf9]/8' : 'border-[#0f1114]/10 md:border-0'
                  }`}
                >
                  <ProgressRing pct={programPct(p)} active={isSel} />
                  <span>
                    <span className="block text-sm font-medium text-[#0f1114]">{p.program_label}</span>
                    <span className={`text-xs ${MUTED}`}>
                      {p.stage === 'active' ? 'Active' : programPct(p) === 0 ? 'Not started' : 'In progress'}
                    </span>
                  </span>
                </button>
              )
            })}
          </nav>
          <div className="mt-8 hidden md:block">
            <p className="text-sm font-medium text-[#0f1114]">Need help?</p>
            <a href={`mailto:${current.help_email}`} className="text-xs text-[#687cf9]">
              {current.help_email}
            </a>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 p-6 md:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0f1114]">
            {current.program_label} setup
          </h1>

          {current.stage === 'active' ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#cfffcd] px-5 py-4 text-[#1f6b2e]">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white">
                <Check size={20} strokeWidth={3} aria-hidden />
              </span>
              <div>
                <p className="font-semibold">You're live on {current.program_label}</p>
                <p className="text-sm">You're active and receiving work.</p>
              </div>
            </div>
          ) : (
            <p className={`mt-1.5 text-sm ${MUTED}`}>
              Finish your steps to start receiving {current.program_label} work.
            </p>
          )}

          {current.surveys && current.surveys.length > 0 && <IntakeSurveys surveys={current.surveys} />}

          {current.items.length === 0 ? (
            <div className={`mt-8 rounded-xl border border-dashed ${HAIR} p-9 text-center`}>
              <Clock className="mx-auto text-[#687cf9]" size={24} aria-hidden />
              <p className="mt-3 font-semibold text-[#0f1114]">Nothing for you to do yet</p>
              <p className={`mx-auto mt-1 max-w-sm text-sm ${MUTED}`}>
                Fixlane is getting your {current.program_label} program ready. We'll email you the moment
                there's a step for you.
              </p>
            </div>
          ) : (
            <>
              {/* Overall progress + current-phase orientation */}
              <div className="mt-6 mb-1 flex items-center justify-between">
                <span className={`text-[11px] font-medium uppercase tracking-wider ${MUTED}`}>
                  Onboarding progress
                </span>
                <span className={`text-xs ${MUTED}`}>
                  {totalDone} of {totalCounted} steps
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[#ececf0]">
                <div className="h-full bg-[#0f1114]" style={{ width: `${pct}%` }} />
              </div>
              {hasPhases && shopActionPhaseIdx >= 0 ? (
                <p className={`mt-2 text-xs ${MUTED}`}>
                  <span className="font-medium text-[#0f1114]">Your next step</span> · Phase{' '}
                  {phasedGroups[shopActionPhaseIdx].phase} of {phasedGroups.length} ·{' '}
                  {phasedGroups[shopActionPhaseIdx].label}
                </p>
              ) : hasPhases && !allDone ? (
                <p className={`mt-2 text-xs ${MUTED}`}>
                  Nothing for you right now — Fixlane is handling the next steps, and we'll email you
                  when there's something for you to do.
                </p>
              ) : null}

              {/* Phase-grouped checklist */}
              <div className="mt-6 space-y-7">
                {phases.map(g => {
                  const phaseDone = g.items.filter(it => it.completedAt).length
                  const isCurrent = g.phase !== null && g.phase === currentPhaseNum
                  return (
                    <section key={g.phase ?? 'general'}>
                      {g.phase !== null && (
                        <div className="mb-1 flex items-center gap-2.5">
                          <PhaseBadge n={g.phase} done={g.done} current={isCurrent} />
                          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#0f1114]">
                            {g.label}
                          </h2>
                          <span className={`ml-auto text-xs ${MUTED}`}>
                            {phaseDone}/{g.items.length}
                          </span>
                        </div>
                      )}
                      <div className={g.phase !== null ? 'md:pl-[30px]' : ''}>
                        {g.items.map(item => (
                          <ItemRow
                            key={item.key}
                            item={item}
                            saving={saving === item.key}
                            onComplete={() => complete(item, current)}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </Shell>
  )
}

function PhaseBadge({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#cfffcd] text-[#1f6b2e]">
        <Check size={13} strokeWidth={3} aria-hidden />
      </span>
    )
  }
  return (
    <span
      className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
        current ? 'bg-[#687cf9] text-white' : 'border border-[#d7dade] text-[#5f6571]'
      }`}
    >
      {n}
    </span>
  )
}

function ItemRow({
  item,
  saving,
  onComplete,
}: {
  item: Item
  saving: boolean
  onComplete: () => void
}) {
  const done = !!item.completedAt
  const chip = OWNER_CHIP[item.owner]
  const isShopAction = item.completable && !done && !item.blocked
  const hasDetail = !!(
    item.explainer ||
    item.note ||
    (item.spec && item.spec.length) ||
    (item.links && item.links.length)
  )
  const [open, setOpen] = useState(false)

  return (
    <div className={`border-b ${HAIR} ${item.blocked ? 'opacity-55' : ''}`}>
      <div className="flex items-start gap-3 py-3.5">
        <span className="mt-0.5 flex-none" aria-hidden>
          {done ? (
            <Check size={18} className="text-[#687cf9]" strokeWidth={2.5} />
          ) : item.side === 'fixlane' ? (
            <Clock size={18} className="text-[#687cf9]" />
          ) : (
            <span className="block h-4 w-4 rounded-full border-2 border-[#d7dade]" />
          )}
        </span>

        {hasDetail ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] font-medium text-[#0f1114]">{item.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip.cls}`}>{chip.label}</span>
              {item.optional && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  Optional
                </span>
              )}
              <ChevronDown
                size={15}
                className={`text-[#9aa1ab] transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </div>
            {item.blocked && item.unlocksAfterLabel && (
              <p className={`mt-1 flex items-center gap-1 text-xs ${MUTED}`}>
                <Lock size={11} aria-hidden /> Unlocks after: {item.unlocksAfterLabel}
              </p>
            )}
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] font-medium text-[#0f1114]">{item.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip.cls}`}>{chip.label}</span>
              {item.optional && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  Optional
                </span>
              )}
            </div>
            {item.blocked && item.unlocksAfterLabel && (
              <p className={`mt-1 flex items-center gap-1 text-xs ${MUTED}`}>
                <Lock size={11} aria-hidden /> Unlocks after: {item.unlocksAfterLabel}
              </p>
            )}
          </div>
        )}

        <div className="flex-none">
          {done ? (
            <span className="flex items-center gap-1 rounded bg-[#cfffcd] px-2 py-0.5 text-[11px] font-medium text-[#1f6b2e]">
              <Check size={12} strokeWidth={3} aria-hidden /> Done
            </span>
          ) : isShopAction ? (
            <button
              disabled={saving}
              onClick={onComplete}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ background: VIOLET }}
            >
              {saving ? 'Saving…' : 'Mark done'}
            </button>
          ) : item.side === 'fixlane' && !item.blocked ? (
            <span className={`rounded bg-[#eef0f3] px-2 py-0.5 text-[11px] ${MUTED}`}>In progress</span>
          ) : null}
        </div>
      </div>

      {open && hasDetail && (
        <div className="pb-4 pl-7 pr-1">
          {item.explainer && (
            <p className="mb-2 text-[13.5px] font-medium text-[#0f1114]">{item.explainer}</p>
          )}
          {item.note && <p className={`mb-3 text-[13px] ${MUTED}`}>{item.note}</p>}
          {item.spec && item.spec.length > 0 && (
            <dl className="mb-3 space-y-1.5">
              {item.spec.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[13px]">
                  <dt className="w-24 flex-none font-medium text-[#9aa1ab]">{k}</dt>
                  <dd className="text-[#3f474f]">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {item.links && item.links.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {item.links.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${
                    link.primary
                      ? 'text-white'
                      : `border border-[#d7dade] bg-white text-[#0f1114] hover:bg-[#f4f5f7]`
                  }`}
                  style={link.primary ? { background: VIOLET } : undefined}
                >
                  {link.label}
                  <ExternalLink size={14} aria-hidden />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IntakeSurveys({ surveys }: { surveys: SurveyItem[] }) {
  const done = surveys.filter(s => s.status === 'submitted').length
  return (
    <section className="mt-7">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#687cf9] text-[11px] font-semibold text-white">
          <i className="not-italic">1</i>
        </span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#0f1114]">Tell us about your shop</h2>
        <span className={`ml-auto text-xs ${MUTED}`}>
          {done} of {surveys.length} done
        </span>
      </div>
      <p className={`mb-1 pl-[30px] text-xs ${MUTED}`}>
        A few quick surveys so we can match you with the right work. Save and come back anytime.
      </p>
      <div className="md:pl-[30px]">
        {surveys.map(s => (
          <SurveyRow key={s.key} s={s} />
        ))}
      </div>
    </section>
  )
}

function SurveyRow({ s }: { s: SurveyItem }) {
  const submitted = s.status === 'submitted'
  return (
    <div className={`flex items-start gap-3 border-b ${HAIR} py-3.5`}>
      <span className="mt-0.5 flex-none" aria-hidden>
        {submitted ? (
          <Check size={18} className="text-[#687cf9]" strokeWidth={2.5} />
        ) : (
          <span className="block h-4 w-4 rounded-full border-2 border-[#d7dade]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-medium text-[#0f1114]">{s.label}</span>
          {submitted ? (
            <span className="flex items-center gap-1 rounded bg-[#cfffcd] px-2 py-0.5 text-[11px] font-medium text-[#1f6b2e]">
              <Check size={12} strokeWidth={3} aria-hidden /> Submitted
            </span>
          ) : s.status === 'in_progress' ? (
            <span className={`rounded bg-[#eef0f3] px-2 py-0.5 text-[11px] ${MUTED}`}>In progress</span>
          ) : null}
        </div>
        <p className={`mt-0.5 text-xs ${MUTED}`}>{s.detail}</p>
      </div>
      <a
        href={s.href}
        className={
          submitted
            ? 'flex-none rounded-lg border border-[#cfd2d8] px-4 py-2 text-sm font-medium text-[#0f1114]'
            : 'flex-none rounded-lg bg-[#687cf9] px-4 py-2 text-sm font-medium text-white'
        }
      >
        {s.cta} {submitted ? '' : '→'}
      </a>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eceef1] p-4 sm:p-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[#0f1114]/10 bg-[#f9f9fb]">
        {children}
      </div>
    </div>
  )
}
