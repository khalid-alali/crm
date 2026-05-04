'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, CircleX, FileText, Info, User, X } from 'lucide-react'
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
  capabilities_parking_spots_rw: number | null
  capabilities_two_post_lifts: number | null
  capabilities_afterhours_tow_ins: string | null
  capabilities_night_drops: string | null
  capabilities_tires: string | null
  capabilities_wheel_alignment: string | null
  capabilities_body_work: string | null
  capabilities_adas: string | null
  capabilities_ac_work: string | null
  capabilities_forklift: string | null
  capabilities_hv_battery_table: string | null
  capabilities_windshields: string | null
}

interface RawSurvey {
  id: string
  tech_full_name: string | null
  responses: unknown
  created_at: string | null
}

type QuizAnswer = {
  question: string
  answer: string
  expected: string | null
  isCorrect: boolean | null
}

type TechSurveyCard = {
  id: string
  name: string
  years: string | null
  surveyedAt: string | null
  vehicles: string[]
  regularWork: string[]
  evBrands: string[]
  evHvRepairs: string[]
  aseCerts: string[]
  hasHvCert: boolean
  hasAcCert: boolean
  hasAseCert: boolean
  hasOemWarranty: boolean
  hasHvMeter: boolean
  quizCorrect: number | null
  quizTotal: number | null
  quizAnswers: QuizAnswer[]
}

interface Props {
  locationId: string
  locationName: string
  location: CapabilitiesData
  techSurveys: RawSurvey[]
  onSendForm?: () => void
}

export function CapabilitiesSection({
  locationId,
  locationName,
  location,
  techSurveys,
  onSendForm,
}: Props) {
  const submitted = !!location.capabilities_submitted_at
  const [openQuizForTech, setOpenQuizForTech] = useState<TechSurveyCard | null>(null)
  const [surveyModalOpen, setSurveyModalOpen] = useState(false)
  const techCards = useMemo(() => techSurveys.map(parseSurveyCard), [techSurveys])
  const hasSurveys = techCards.length > 0

  const modals = (
    <>
      {openQuizForTech && (
        <QuizAnswersModal tech={openQuizForTech} onClose={() => setOpenQuizForTech(null)} />
      )}
      <SurveyTechnicianModal
        open={surveyModalOpen}
        onClose={() => setSurveyModalOpen(false)}
        locationId={locationId}
        locationName={locationName}
      />
    </>
  )

  /* State A — no capabilities, no surveys */
  if (!submitted && !hasSurveys) {
    return (
      <>
        <div className="rounded-xl border border-arctic-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10 sm:py-14">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-arctic-100 text-onix-500">
            <FileText className="h-6 w-6" aria-hidden />
          </div>
          <h3 className="text-base font-semibold text-onix-900">No capabilities data yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-onix-500">
            Send the capabilities form to the shop, or survey a technician.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <button
              type="button"
              onClick={() => setSurveyModalOpen(true)}
              className="inline-flex w-full min-w-[200px] items-center justify-center gap-2 rounded-lg border border-arctic-300 bg-white px-4 py-2.5 text-sm font-medium text-onix-800 hover:bg-arctic-50 sm:w-auto"
            >
              <User className="h-4 w-4 shrink-0" aria-hidden />
              Survey a technician
            </button>
            {onSendForm ? (
              <button
                type="button"
                onClick={onSendForm}
                className="inline-flex w-full min-w-[200px] items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 sm:w-auto"
              >
                Send capabilities form
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        {modals}
      </>
    )
  }

  /* State B — surveys present, capabilities not submitted */
  if (!submitted && hasSurveys) {
    return (
      <>
        <CapabilitiesNudgeBanner onSendForm={onSendForm} />
        <TechnicianCompetencyPanel
          techCards={techCards}
          onSurveyClick={() => setSurveyModalOpen(true)}
          onOpenQuiz={setOpenQuizForTech}
          interiorEmpty={false}
        />
        {modals}
      </>
    )
  }

  /* State C & D — shop capabilities submitted */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-onix-900">Shop capabilities</h3>
        <span className="text-xs text-onix-400">
          Submitted{' '}
          {new Date(location.capabilities_submitted_at!).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <ShopCapabilitiesDetailGrid location={location} />

      <TechnicianCompetencyPanel
        techCards={techCards}
        onSurveyClick={() => setSurveyModalOpen(true)}
        onOpenQuiz={setOpenQuizForTech}
        interiorEmpty={!hasSurveys}
      />
      {modals}
    </div>
  )
}

function CapabilitiesNudgeBanner({ onSendForm }: { onSendForm?: () => void }) {
  return (
    <div className="mb-6 flex gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
      <div className="min-w-0">
        <span>Capabilities form not submitted yet. </span>
        {onSendForm ? (
          <button
            type="button"
            onClick={onSendForm}
            className="font-medium text-brand-700 underline decoration-brand-600/40 underline-offset-2 hover:text-brand-800"
          >
            Send it to the shop →
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ShopCapabilitiesDetailGrid({ location }: { location: CapabilitiesData }) {
  const isCA =
    location.state?.toUpperCase() === 'CA' || location.state?.toUpperCase() === 'CALIFORNIA'
  return (
    <>
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-onix-500">Capacity</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Techs on Fixlane"
            value={location.allocated_techs}
            secondary={location.total_techs}
            formatValue={formatAllocatedTechsDisplay}
          />
          <StatCard label="Daily capacity" value={location.daily_appointment_capacity} />
          <StatCard label="Weekly capacity" value={location.weekly_appointment_capacity} />
          <StatCard label="2-post lifts" value={location.capabilities_two_post_lifts} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-onix-500">Service capabilities</div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <StatusRow label="HV battery / scissor table" value={formatStatus(location.capabilities_hv_battery_table)} />
          <StatusRow label="Forklift" value={formatStatus(location.capabilities_forklift)} />
          <StatusRow label="Wheel alignment" value={formatStatus(location.capabilities_wheel_alignment)} />
          <StatusRow label="ADAS calibration" value={formatStatus(location.capabilities_adas)} />
          <StatusRow label="Tire R/R + balance" value={formatStatus(location.capabilities_tires)} />
          <StatusRow label="Body work" value={formatStatus(location.capabilities_body_work)} />
          <StatusRow label="A/C service" value={formatAcStatus(location.capabilities_ac_work)} />
          <StatusRow label="Windshield replacement" value={formatStatus(location.capabilities_windshields)} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-onix-500">Operational</div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <DetailRow label="Warranty" value={location.standard_warranty} />
          <DetailRow label="Parking spots" value={numOrDash(location.capabilities_parking_spots_rw)} />
          <StatusRow label="After-hours tow-ins" value={formatStatus(location.capabilities_afterhours_tow_ins)} />
          <StatusRow label="Night-drops" value={formatStatus(location.capabilities_night_drops)} />
          <DetailRow label="Hours" value={formatHoursForDisplay(location.hours_of_operation)} />
          {isCA && <DetailRow label="BAR license" value={location.bar_license_number} />}
        </div>
      </section>
    </>
  )
}

function TechnicianCompetencyPanel({
  techCards,
  onSurveyClick,
  onOpenQuiz,
  interiorEmpty,
}: {
  techCards: TechSurveyCard[]
  onSurveyClick: () => void
  onOpenQuiz: (t: TechSurveyCard) => void
  interiorEmpty: boolean
}) {
  const hvCertified = techCards.filter(t => t.hasHvCert).length
  const acCertified = techCards.filter(t => t.hasAcCert).length
  const aseCertified = techCards.filter(t => t.hasAseCert).length
  const oemWarrantyExp = techCards.filter(t => t.hasOemWarranty).length
  const hvMeterCount = techCards.filter(t => t.hasHvMeter).length
  const latestSurveyDate = techCards
    .map(t => (t.surveyedAt ? new Date(t.surveyedAt) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-onix-500">Technician competency</div>
          {techCards.length > 0 ? (
            <div className="mt-1 text-xs text-onix-500">
              {techCards.length} surveyed
              {latestSurveyDate
                ? ` · Latest ${latestSurveyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : ''}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onSurveyClick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-arctic-300 bg-white px-2.5 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50"
        >
          <User className="h-3.5 w-3.5" aria-hidden />
          Survey a technician
        </button>
      </div>

      {techCards.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat label="HV certified" value={hvCertified} />
          <MiniStat label="AC (EPA 609)" value={acCertified} />
          <MiniStat label="ASE certified" value={aseCertified} />
          <MiniStat label="OEM warranty exp" value={oemWarrantyExp} />
          <MiniStat label="Own HV meter" value={hvMeterCount} />
        </div>
      ) : null}

      <div className="space-y-2">
        {interiorEmpty && techCards.length === 0 ? (
          <div className="rounded-xl border border-arctic-200 bg-arctic-50 px-6 py-12 text-center">
            <p className="text-sm font-medium text-onix-800">No technicians surveyed yet</p>
            <button
              type="button"
              onClick={onSurveyClick}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              <User className="h-4 w-4" aria-hidden />
              Survey a technician
            </button>
          </div>
        ) : null}
        {techCards.map(tech => (
          <button
            key={tech.id}
            type="button"
            onClick={() => onOpenQuiz(tech)}
            className="w-full rounded-lg border border-arctic-200 p-4 text-left hover:bg-arctic-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                  {initialsForName(tech.name)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-onix-900">
                    {tech.name}
                    {formatYearsDisplay(tech.years) ? (
                      <span className="ml-1.5 text-xs font-normal text-onix-500">
                        {formatYearsDisplay(tech.years)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-onix-500">Surveyed {formatSurveyDate(tech.surveyedAt)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill label="HV cert" ok={tech.hasHvCert} />
                <StatusPill label="AC cert" ok={tech.hasAcCert} />
                <StatusPill label="HV meter" ok={tech.hasHvMeter} />
                <StatusPill label="OEM warranty" ok={tech.hasOemWarranty} />
                {tech.quizTotal !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${quizPillClass(tech.quizCorrect, tech.quizTotal)}`}
                  >
                    Quiz {tech.quizCorrect ?? 0}/{tech.quizTotal}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 border-t border-arctic-200 pt-3">
              <LabeledChipRow
                label="ASE certs"
                chips={tech.aseCerts.length ? tech.aseCerts.map(shortenAseLabel) : ['None']}
                tone="neutral"
              />
              <LabeledChipRow
                label="Vehicles"
                chips={tech.vehicles.length ? tech.vehicles.map(shortenVehicleLabel) : ['None']}
              />
              <LabeledChipRow
                label="Regular work"
                chips={tech.regularWork.length ? tech.regularWork.map(shortenRegularWorkLabel) : ['None']}
              />
              <LabeledChipRow
                label="EV brands"
                chips={tech.evBrands.length ? tech.evBrands : ['None listed']}
                tone="indigo"
              />
              <LabeledChipRow
                label="EV/HV repairs"
                chips={tech.evHvRepairs.length ? tech.evHvRepairs.map(shortenRepairLabel) : ['None listed']}
              />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

const FILLOUT_TECH_EVAL_FORM_BASE = 'https://forms.fillout.com/t/eCyjERXVBRus'

function buildFilloutTechSurveyUrl(params: {
  techName: string
  techEmail: string
  shopName: string
  locationId: string
}): string {
  const u = new URL(FILLOUT_TECH_EVAL_FORM_BASE)
  u.searchParams.set('name', params.techName.trim())
  u.searchParams.set('email', params.techEmail.trim().toLowerCase())
  u.searchParams.set('shop', params.shopName.trim())
  u.searchParams.set('shop_id', params.locationId)
  return u.toString()
}

function buildTechSurveyEmailHtml(formHref: string): string {
  const safeHref = escapeHtmlAttr(formHref)
  return `<p>Hey!</p>
<p>This is RepairWise, your shop recently joined the largest EV repair network in the country.</p>
<p>Please take 5 minutes to complete this <a href="${safeHref}" target="_blank" rel="noopener noreferrer">EV Readiness Form</a>.</p>
<p>This helps us match EV training and jobs to your shop.</p>
<p>Thanks!<br />RepairWise Team</p>`
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function SurveyTechnicianModal({
  open,
  onClose,
  locationId,
  locationName,
}: {
  open: boolean
  onClose: () => void
  locationId: string
  locationName: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<'form' | 'success'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentName, setSentName] = useState('')

  useEffect(() => {
    if (!open) {
      setPhase('form')
      setName('')
      setEmail('')
      setError(null)
      setSentName('')
    }
  }, [open])

  if (!open) return null

  async function submitSend() {
    setError(null)
    const n = name.trim()
    const em = email.trim().toLowerCase()
    if (!n) {
      setError('Technician name is required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('Enter a valid email address.')
      return
    }
    const formHref = buildFilloutTechSurveyUrl({
      techName: n,
      techEmail: em,
      shopName: locationName,
      locationId,
    })
    const bodyHtml = buildTechSurveyEmailHtml(formHref)
    setSending(true)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          to: em,
          subject: 'RepairWise — EV readiness survey',
          bodyHtml,
          fromShopDetail: true,
          fromShopDetailLabel: 'Technician survey',
          skipLocationStatusAdvance: true,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send email')
      setSentName(n)
      setPhase('success')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-tech-modal-title"
      >
        <div className="border-b border-arctic-200 px-5 py-4">
          <h4 id="survey-tech-modal-title" className="text-lg font-semibold text-onix-950">
            Survey a technician
          </h4>
          <p className="mt-1 text-sm text-onix-600">
            We&apos;ll send them a short survey link. You can send to multiple technicians by repeating this.
          </p>
        </div>

        {phase === 'form' ? (
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-onix-500">
                Technician name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Marcus Torres"
                className="mt-1 w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm text-onix-900 outline-none focus:border-brand-600"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-onix-500">
                Email address
              </label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="marcus@shopname.com"
                className="mt-1 w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm text-onix-900 outline-none focus:border-brand-600"
                autoComplete="email"
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-arctic-300 px-4 py-2 text-sm font-medium text-onix-800 hover:bg-arctic-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void submitSend()}
                className="rounded-lg border border-onix-900 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send survey'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              role="status"
            >
              Survey link sent to <span className="font-semibold">{sentName}</span>.
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhase('form')
                  setName('')
                  setEmail('')
                  setError(null)
                }}
                className="rounded-lg border border-arctic-300 px-4 py-2 text-sm font-medium text-onix-800 hover:bg-arctic-50"
              >
                Send to another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-onix-900 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <p className="border-t border-arctic-100 px-5 py-3 text-center text-xs text-onix-500">
          To survey another technician, just submit again
        </p>
      </div>
    </div>
  )
}

function formatYearsDisplay(years: string | null): string | null {
  if (!years) return null
  const t = years.trim()
  if (!t) return null
  if (/year/i.test(t)) return t
  return `${t} years`
}

/** Fillout webhooks store answers under `responses.questions[]`; map into legacy grid keys for parsing. */
function mergeFilloutQuestionsIntoResponse(response: Record<string, unknown>): Record<string, unknown> {
  const questions = response.questions
  if (!Array.isArray(questions) || questions.length === 0) return response
  const out: Record<string, unknown> = { ...response }
  for (const item of questions) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const value = row.value
    if (!name) continue
    const set = (key: string) => {
      if (value == null || value === '') return
      if (out[key] == null || out[key] === '') out[key] = value
    }
    if (name.includes('years of experience') && name.includes('shop')) {
      set('Years of Experience (Full Time)')
    } else if (name.includes('OEM warranty') && name.includes('dealership')) {
      set('Performed OEM Warranty Repairs')
    } else if (name.includes('vehicles are you comfortable')) {
      set('Vehicles Comfortable With')
    } else if (name.includes('work do you perform') && name.includes('regular')) {
      set('Types of Regular Work')
    } else if (name === 'ASE Certificates') {
      set('ASE Certificates')
    } else if (name.includes('High Voltage (HV) certified')) {
      set('HV Certified')
    } else if (name.includes('EPA 609')) {
      set('AC Certified (EPA 609)')
    } else if (name.includes('EV brands have you worked')) {
      set('EV Brands Experience')
    } else if (name.includes('EV / HV repairs')) {
      set('EV/HV Repairs Performed')
    } else if (name.includes('multimeter') && name.includes('HV isolation')) {
      set('Owns HV Isolation Multimeter/Kit')
    } else if (name.includes('crank, no start')) {
      set('Crank No Start - First Steps Answer')
    } else if (name.includes('AC blowing warm')) {
      set('AC Blowing Warm - Suspected Issue')
    } else if (name.includes("window doesn't roll") || name.includes('window does not roll')) {
      set('Window Inoperative - First Check')
    } else if (name.includes('left hand mirror')) {
      set('Mirror Tilt Fault Suspect')
    }
  }
  return out
}

function parseSurveyCard(survey: RawSurvey): TechSurveyCard {
  const raw =
    survey.responses && typeof survey.responses === 'object' ? (survey.responses as Record<string, unknown>) : {}
  const response = mergeFilloutQuestionsIntoResponse(raw)
  const answers = parseQuizAnswers(response)
  const scored = answers.filter(a => a.isCorrect !== null)
  const aseRaw = firstStringFromValues([response['ASE Certificates']])
  const aseCerts = aseRaw && aseRaw.toLowerCase() !== 'no' ? splitCsvishList(aseRaw) : []

  return {
    id: survey.id,
    name: fallbackText(survey.tech_full_name, 'Unknown technician'),
    years: firstStringFromValues([response['Years of Experience (Full Time)']]),
    surveyedAt: survey.created_at ?? null,
    vehicles: splitCsvishList(response['Vehicles Comfortable With']),
    regularWork: splitCsvishList(response['Types of Regular Work']),
    evBrands: splitCsvishList(response['EV Brands Experience']),
    evHvRepairs: splitCsvishList(response['EV/HV Repairs Performed']),
    aseCerts,
    hasHvCert: parseNullableBool(response['HV Certified']) === true,
    hasAcCert: parseNullableBool(response['AC Certified (EPA 609)']) === true,
    hasAseCert: aseCerts.length > 0,
    hasOemWarranty: parseNullableBool(response['Performed OEM Warranty Repairs']) === true,
    hasHvMeter: parseNullableBool(response['Owns HV Isolation Multimeter/Kit']) === true,
    quizCorrect: scored.length > 0 ? scored.filter(a => a.isCorrect).length : null,
    quizTotal: scored.length > 0 ? scored.length : null,
    quizAnswers: answers,
  }
}

function parseQuizAnswers(response: Record<string, unknown>): QuizAnswer[] {
  return parseQuizFromKnownColumns(response)
}

function parseQuizFromKnownColumns(response: Record<string, unknown>): QuizAnswer[] {
  const rows: Array<{
    question: string
    answerKeys: string[]
    expected: string
  }> = [
    {
      question: 'Crank no start - first steps',
      answerKeys: ['Crank No Start - First Steps Answer', 'Crank No Start - Explanation (Other)'],
      expected: 'All of the above (verify spark, fuel pressure, check voltage and comms)',
    },
    {
      question: 'AC blowing warm - suspected issue',
      answerKeys: ['AC Blowing Warm - Suspected Issue', 'AC Blowing Warm - Explanation (Other)'],
      expected: 'All of the above',
    },
    {
      question: 'Window inoperative - first check',
      answerKeys: ['Window Inoperative - First Check'],
      expected: 'Battery voltage',
    },
    {
      question: 'Mirror tilt fault suspect',
      answerKeys: ['Mirror Tilt Fault Suspect'],
      expected: 'The actuator or control switch',
    },
  ]

  return rows
    .map<QuizAnswer | null>(row => {
      const answer = firstStringFromValues(row.answerKeys.map(k => response[k]))
      if (!answer) return null
      const isCorrect = normalizeQuizValue(answer) === normalizeQuizValue(row.expected)
      return {
        question: row.question,
        answer,
        expected: row.expected,
        isCorrect,
      }
    })
    .filter((v): v is QuizAnswer => Boolean(v))
}

function formatStatus(value: string | null): 'yes' | 'no' | 'sublet' | 'other' {
  if (!value) return 'other'
  if (value === 'yes' || value === 'in_shop' || value === 'machine_balancer') return 'yes'
  if (value === 'no') return 'no'
  if (value === 'sublet') return 'sublet'
  return 'other'
}

function formatAcStatus(value: string | null): 'yes' | 'no' | 'sublet' | 'other' {
  if (!value) return 'other'
  if (value === 'no') return 'no'
  return 'yes'
}

function numOrDash(value: number | null): string {
  return value === null ? '—' : String(value)
}

function StatusRow({ label, value }: { label: string; value: 'yes' | 'no' | 'sublet' | 'other' }) {
  return (
    <div className="flex items-center justify-between border-b border-arctic-200 pb-1">
      <span className="text-onix-700">{label}</span>
      <StatusValue value={value} />
    </div>
  )
}

function StatusValue({ value }: { value: 'yes' | 'no' | 'sublet' | 'other' }) {
  if (value === 'yes') return <Check className="h-4 w-4 text-emerald-600" aria-label="Yes" />
  if (value === 'no') return <CircleX className="h-4 w-4 text-red-600" aria-label="No" />
  if (value === 'sublet') return <span className="text-xs font-medium text-onix-700">Sublet</span>
  return <span className="text-xs text-onix-400">—</span>
}

function StatCard({
  label,
  value,
  secondary,
  formatValue,
}: {
  label: string
  value: number | null
  secondary?: number | null
  formatValue?: (n: number | null) => string
}) {
  const primary = formatValue ? formatValue(value) : value ?? '—'
  const withSecondary =
    typeof secondary === 'number' && typeof value === 'number' ? `${primary} / ${secondary}` : primary
  return (
    <div className="rounded-lg bg-arctic-50 p-3">
      <div className="text-2xl font-bold text-onix-950">{withSecondary}</div>
      <div className="mt-0.5 text-xs text-onix-500">{label}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-arctic-50 p-3">
      <div className="text-xl font-semibold text-onix-900">{value}</div>
      <div className="text-xs text-onix-500">{label}</div>
    </div>
  )
}

function Badge({ label, tone }: { label: string; tone: 'blue' | 'amber' | 'violet' | 'rose' }) {
  const toneClass =
    tone === 'blue'
      ? 'bg-sky-100 text-sky-800'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'violet'
          ? 'bg-violet-100 text-violet-800'
          : 'bg-rose-100 text-rose-800'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{label}</span>
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  const cls = ok
    ? 'border-violet-300 bg-violet-100 text-violet-800'
    : 'border-arctic-300 bg-white text-onix-700'
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label} {ok ? '✓' : '✕'}</span>
}

function LabeledChipRow({
  label,
  chips,
  tone = 'neutral',
}: {
  label: string
  chips: string[]
  tone?: 'neutral' | 'amber' | 'indigo'
}) {
  return (
    <div className="mb-2 grid grid-cols-[110px_1fr] items-start gap-2 last:mb-0">
      <div className="pt-1 text-sm text-onix-600">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, idx) => (
          <Chip key={`${label}-${idx}-${chip}`} text={chip} tone={tone} />
        ))}
      </div>
    </div>
  )
}

function Chip({ text, tone }: { text: string; tone: 'neutral' | 'amber' | 'indigo' }) {
  const isNone = text.toLowerCase().includes('none')
  const cls = isNone
    ? 'border-arctic-300 border-dashed bg-white italic text-onix-500'
    : tone === 'indigo'
      ? 'border-violet-300 bg-white text-violet-800'
      : 'border-arctic-300 bg-white text-onix-700'
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{text}</span>
}

function QuizAnswersModal({ tech, onClose }: { tech: TechSurveyCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-arctic-200 px-4 py-3">
          <div>
            <h4 className="text-lg font-semibold text-onix-950">Quiz answers - {tech.name}</h4>
            <p className="text-sm text-onix-600">
              Diagnostic competency: {tech.quizCorrect ?? 0} of {tech.quizTotal ?? 0} correct
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-arctic-300 p-2 text-onix-600 hover:bg-arctic-50"
            aria-label="Close quiz modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-auto px-4 py-3">
          {tech.quizAnswers.length === 0 && (
            <div className="text-sm text-onix-500">No quiz answers available.</div>
          )}
          {tech.quizAnswers.map((answer, idx) => (
            <div key={`${tech.id}-q-${idx}`} className="border-b border-arctic-200 pb-3 last:border-b-0">
              <div className="mb-1 flex items-start gap-2 text-sm font-medium text-onix-900">
                {answer.isCorrect === false ? (
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                )}
                {answer.question}
              </div>
              <div className="pl-6 text-sm text-onix-800">
                Answered: <span className="font-medium">{answer.answer || '—'}</span>
              </div>
              {answer.expected ? (
                <div className="pl-6 text-xs italic text-onix-500">Expected: {answer.expected}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-arctic-200 pb-1">
      <span className="text-onix-500">{label}</span>
      <span className="text-onix-900">{value || '—'}</span>
    </div>
  )
}

function firstText(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = firstStringFromValues([source[key]])
    if (value) return value
  }
  return null
}

function firstBool(source: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const v = parseNullableBool(source[key])
    if (v !== null) return v
  }
  return false
}

function parseNullableBool(input: unknown): boolean | null {
  if (typeof input === 'boolean') return input
  if (typeof input === 'number') return input > 0
  if (typeof input === 'string') {
    const v = input.trim().toLowerCase()
    if (['yes', 'true', '1', 'y'].includes(v)) return true
    if (['no', 'false', '0', 'n'].includes(v)) return false
  }
  return null
}

function firstStringFromValues(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
    if (Array.isArray(value)) {
      const joined = value
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .join(' · ')
      if (joined) return joined
    }
  }
  return null
}

function fallbackText(input: unknown, fallback: string): string {
  const maybe = typeof input === 'string' ? input.trim() : ''
  return maybe || fallback
}

function normalizeQuizValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatCsvishList(input: unknown): string | null {
  const items = splitCsvishList(input)
  return items.length ? items.join(' · ') : null
}

function splitCsvishList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map(v => (typeof v === 'string' ? cleanListToken(v) : ''))
      .filter(Boolean)
  }
  if (typeof input !== 'string') return []
  const raw = input.trim()
  if (!raw) return []

  // Handles values like:
  // "\"Domestic (...)\",\"European (...)\",\"Asian (...)\""
  // and also plain comma-separated values.
  const normalizedQuotes = raw.replace(/\\"/g, '"').replace(/""/g, '"')
  const matches = [...normalizedQuotes.matchAll(/"([^"]+)"/g)].map(m => cleanListToken(m[1]))
  if (matches.length > 0) return matches.filter(Boolean)

  const items = normalizedQuotes
    .split(',')
    .map(part => cleanListToken(part))
    .filter(Boolean)

  return items
}

function cleanListToken(value: string): string {
  return value.replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim()
}

function formatSurveyDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}

function shortenVehicleLabel(value: string): string {
  if (value.startsWith('Domestic')) return 'Domestic'
  if (value.startsWith('European')) return 'European'
  if (value.startsWith('Asian')) return 'Asian'
  return value
}

function shortenRegularWorkLabel(value: string): string {
  if (value.startsWith('Maintenance Work')) return 'Maintenance'
  if (value.startsWith('R&R Work')) return 'R&R'
  if (value.startsWith('Engine Performance Diagnosis')) return 'Engine perf. diag'
  if (value.startsWith('Electrical Diagnosis & Repair')) return 'Electrical diag'
  if (value.startsWith('Heavy Line Repairs')) return 'Heavy line'
  return value
}

function shortenAseLabel(value: string): string {
  return value
    .replace(' - Heating & A/C', ' Heating & A/C')
    .replace(' - Engine Performance', ' Engine Perf.')
    .replace(' - Electrical / Electronic Systems', ' Electrical')
}

function shortenRepairLabel(value: string): string {
  if (value === 'Software / Firmware Updates') return 'Software updates'
  if (value.toLowerCase().includes('cooling system')) return 'Cooling system'
  return value
}

function quizPillClass(correct: number | null, total: number | null): string {
  if (correct === null || total === null || total === 0) return 'bg-arctic-100 text-onix-700'
  if (correct === total) return 'bg-emerald-100 text-emerald-800'
  if (correct >= Math.ceil(total / 2)) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

