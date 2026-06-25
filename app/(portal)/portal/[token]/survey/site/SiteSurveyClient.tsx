'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import SurveyForm from '@/components/portal/SurveyForm'
import { SITE_SURVEY } from '@/lib/surveys/site-survey'
import type { SurveyResponses } from '@/lib/surveys/types'

export default function SiteSurveyClient({ token }: { token: string }) {
  const [initial, setInitial] = useState<SurveyResponses | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    fetch(`/api/portal/${token}/survey/site`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? 'This link has expired.' : 'Something went wrong.')
        return r.json()
      })
      .then((d: { responses: SurveyResponses; submitted_at: string | null }) => {
        if (off) return
        setInitial(d.responses ?? {})
        setSubmitted(!!d.submitted_at)
      })
      .catch(e => !off && setError(e.message))
    return () => {
      off = true
    }
  }, [token])

  async function save(responses: SurveyResponses, submit: boolean) {
    const r = await fetch(`/api/portal/${token}/survey/site`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses, submit }),
    })
    return r
  }

  return (
    <div className="min-h-screen bg-[#eceef1] p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/portal/${token}/onboarding`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#5f6571] hover:text-[#0f1114]"
        >
          <ArrowLeft size={15} aria-hidden /> Back to onboarding
        </a>
        <div className="rounded-2xl border border-[#0f1114]/10 bg-[#f9f9fb] p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0f1114]">{SITE_SURVEY.title}</h1>
          {error ? (
            <p className="mt-6 text-sm text-[#993c1d]">{error}</p>
          ) : initial === null ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-[#5f6571]">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            <div className="mt-4">
              <SurveyForm
                spec={SITE_SURVEY}
                initial={initial}
                submitted={submitted}
                submitLabel="Submit survey"
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
