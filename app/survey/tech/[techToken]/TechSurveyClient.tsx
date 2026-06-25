'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import SurveyForm from '@/components/portal/SurveyForm'
import { TECHNICIAN_SURVEY } from '@/lib/surveys/technician-survey'
import type { SurveyResponses } from '@/lib/surveys/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; responses: SurveyResponses; submitted: boolean; shopName: string | null }

export default function TechSurveyClient({ techToken }: { techToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let off = false
    fetch(`/api/survey/tech/${techToken}`)
      .then(async r => {
        if (!r.ok) {
          throw new Error(
            r.status === 401
              ? 'This link is invalid or has expired.'
              : r.status === 404
                ? 'We couldn’t find your form.'
                : 'Something went wrong loading your form.',
          )
        }
        return r.json()
      })
      .then((d: { responses: SurveyResponses; submitted: boolean; shopName: string | null }) => {
        if (off) return
        setState({ kind: 'ready', responses: d.responses ?? {}, submitted: !!d.submitted, shopName: d.shopName })
      })
      .catch(e => !off && setState({ kind: 'error', message: (e as Error).message }))
    return () => {
      off = true
    }
  }, [techToken])

  async function save(responses: SurveyResponses, submit: boolean) {
    return fetch(`/api/survey/tech/${techToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses, submit }),
    })
  }

  return (
    <div className="min-h-screen bg-[#f9f9fb] p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-[#0f1114]/10 bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0f1114]">{TECHNICIAN_SURVEY.title}</h1>
          {state.kind === 'ready' && state.shopName && (
            <p className="mt-1 text-sm text-[#5f6571]">Invited by {state.shopName}</p>
          )}

          {state.kind === 'error' ? (
            <p className="mt-6 text-sm text-[#993c1d]">{state.message}</p>
          ) : state.kind === 'loading' ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-[#5f6571]">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            <div className="mt-4">
              <SurveyForm
                spec={TECHNICIAN_SURVEY}
                initial={state.responses}
                submitted={state.submitted}
                submitLabel="Submit"
                onAutosave={async r => {
                  await save(r, false)
                }}
                onSubmit={async r => {
                  const res = await save(r, true)
                  const j = await res.json().catch(() => ({}))
                  return { ok: res.ok, error: j.error }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
