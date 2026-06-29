'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  isAnswered,
  missingRequired,
  type SurveyQuestion,
  type SurveyResponses,
  type SurveyResponseValue,
  type SurveySpec,
} from '@/lib/surveys/types'

const MUTED = 'text-[#5f6571]'

export default function SurveyForm({
  spec,
  initial,
  submitted,
  onAutosave,
  onSubmit,
  submitLabel = 'Submit',
}: {
  spec: SurveySpec
  initial: SurveyResponses
  submitted: boolean
  onAutosave?: (r: SurveyResponses) => Promise<void> | void
  onSubmit: (r: SurveyResponses) => Promise<{ ok: boolean; error?: string }>
  submitLabel?: string
}) {
  const [responses, setResponses] = useState<SurveyResponses>(initial)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(submitted)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback(
    (next: SurveyResponses) => {
      if (!onAutosave || done) return
      if (timer.current) clearTimeout(timer.current)
      setSaveState('saving')
      timer.current = setTimeout(async () => {
        await onAutosave(next)
        setSaveState('saved')
      }, 700)
    },
    [onAutosave, done],
  )

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current)
    },
    [],
  )

  function set(q: SurveyQuestion, value: SurveyResponseValue) {
    const next = { ...responses, [q.key]: value }
    setResponses(next)
    if (invalid.has(q.key) && isAnswered(q, value)) {
      const n = new Set(invalid)
      n.delete(q.key)
      setInvalid(n)
    }
    scheduleSave(next)
  }

  async function handleSubmit() {
    const missing = missingRequired(spec, responses)
    if (missing.length > 0) {
      setInvalid(new Set(missing.map(q => q.key)))
      setError(`Please answer ${missing.length} required question${missing.length > 1 ? 's' : ''}.`)
      document.getElementById(`q-${missing[0].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await onSubmit(responses)
    setSubmitting(false)
    if (res.ok) setDone(true)
    else setError(res.error || 'Could not submit. Please try again.')
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#cfffcd] text-[#1f6b2e]">
          <Check size={24} strokeWidth={3} aria-hidden />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-[#0f1114]">Submitted — thank you</h2>
        <p className={`mt-2 text-sm ${MUTED}`}>Your responses have been recorded.</p>
      </div>
    )
  }

  return (
    <div>
      {spec.intro && <p className={`text-sm ${MUTED}`}>{spec.intro}</p>}

      {spec.sections.map((section, si) => (
        <section key={si} className="mt-8">
          {section.title && (
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#0f1114]">{section.title}</h2>
          )}
          {section.intro && <p className={`mt-1 text-xs ${MUTED}`}>{section.intro}</p>}
          <div className="mt-3 space-y-6">
            {section.questions.map(q => (
              <div key={q.key} id={`q-${q.key}`}>
                <label className="block text-[15px] font-medium text-[#0f1114]">
                  {q.label}
                  {q.required && <span className="ml-1 text-[#ef5f4b]">*</span>}
                </label>
                {q.help && <p className={`mt-0.5 text-xs ${MUTED}`}>{q.help}</p>}
                <div className={`mt-2 ${invalid.has(q.key) ? 'rounded-lg ring-1 ring-[#ef5f4b] p-2 -m-2' : ''}`}>
                  <Field q={q} value={responses[q.key]} onChange={v => set(q, v)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {error && <p className="mt-6 text-sm text-[#993c1d]">{error}</p>}

      <div className="mt-8 flex items-center gap-4 border-t border-[#0f1114]/10 pt-5">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-[#687cf9] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : submitLabel}
        </button>
        {onAutosave && (
          <span className={`flex items-center gap-1.5 text-xs ${MUTED}`}>
            {saveState === 'saving' ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden /> Saving…
              </>
            ) : saveState === 'saved' ? (
              <>
                <Check size={13} aria-hidden /> Saved
              </>
            ) : (
              'Your answers save as you go'
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function Field({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestion
  value: SurveyResponseValue | undefined
  onChange: (v: SurveyResponseValue) => void
}) {
  const inputCls =
    'w-full rounded-lg border border-[#cfd2d8] bg-white px-3 py-2 text-sm text-[#0f1114] focus:border-[#687cf9] focus:outline-none focus:ring-1 focus:ring-[#687cf9]'

  if (q.type === 'text' || q.type === 'tel' || q.type === 'email' || q.type === 'number') {
    if (q.readOnly) {
      return (
        <input
          type={q.type === 'number' ? 'number' : q.type}
          className={`${inputCls} cursor-default bg-[#eceef1] focus:border-[#cfd2d8] focus:ring-0`}
          value={value == null ? '' : String(value)}
          readOnly
          tabIndex={-1}
          aria-readonly
        />
      )
    }
    return (
      <input
        type={q.type === 'number' ? 'number' : q.type}
        className={inputCls}
        placeholder={q.placeholder}
        value={value == null ? '' : String(value)}
        onChange={e => onChange(q.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      />
    )
  }

  if (q.type === 'yesno') {
    return (
      <div className="flex gap-2">
        {['yes', 'no'].map(opt => {
          const selected = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-lg border px-5 py-1.5 text-sm font-medium capitalize ${
                selected ? 'border-[#687cf9] bg-[#687cf9]/10 text-[#3f47c4]' : 'border-[#cfd2d8] text-[#5f6571]'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }

  if (q.type === 'single') {
    return (
      <div className="space-y-1.5">
        {(q.options ?? []).map(o => {
          const selected = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${
                selected ? 'border-[#687cf9] bg-[#687cf9]/8 text-[#0f1114]' : 'border-[#e2e4e8] text-[#0f1114]'
              }`}
            >
              <span
                className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                  selected ? 'border-[#687cf9]' : 'border-[#cfd2d8]'
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-[#687cf9]" />}
              </span>
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  // multi
  const arr = Array.isArray(value) ? value : []
  function toggle(v: string) {
    onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  }
  return (
    <div className="space-y-1.5">
      {(q.options ?? []).map(o => {
        const selected = arr.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${
              selected ? 'border-[#687cf9] bg-[#687cf9]/8 text-[#0f1114]' : 'border-[#e2e4e8] text-[#0f1114]'
            }`}
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                selected ? 'border-[#687cf9] bg-[#687cf9] text-white' : 'border-[#cfd2d8]'
              }`}
            >
              {selected && <Check size={11} strokeWidth={3} aria-hidden />}
            </span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
