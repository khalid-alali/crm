'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatRateDollars } from '@/lib/labor-rate-approval/sla'

type Preview = {
  shopName: string
  city: string | null
  state: string | null
  chargeRate: number
  status: string
  actionable: boolean
  decidedAt: string | null
  decidedByName: string | null
  decisionReason: string | null
}

type Mode = 'approve' | 'changes_requested'

type Props = {
  token: string
  mode: Mode
}

export default function DecisionPageClient({ token, mode }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/labor-rate-approvals/${encodeURIComponent(token)}`)
      const data = (await res.json().catch(() => ({}))) as Preview & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not load approval')
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load approval')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/labor-rate-approvals/${encodeURIComponent(token)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          decided_by_name: name,
          confirm_checked: mode === 'approve' ? confirmChecked : undefined,
          reason: mode === 'changes_requested' ? reason : undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not submit decision')
      setDone(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  const locationLine = [preview?.city, preview?.state].filter(Boolean).join(', ')

  return (
    <div className="min-h-screen bg-[#f6f4f0] px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-arctic-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-onix-500">RepairWise</p>
        <h1 className="mt-2 text-xl font-semibold text-onix-950">
          {mode === 'approve' ? 'Approve labor rate' : 'Request changes'}
        </h1>

        {loading && <p className="mt-6 text-sm text-onix-600">Loading…</p>}

        {!loading && error && !preview && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && preview && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-arctic-50 px-3 py-2 text-sm text-onix-800">
              <p className="font-medium">{preview.shopName}</p>
              {locationLine ? <p className="text-onix-600">{locationLine}</p> : null}
              <p className="mt-2">
                Proposed labor rate:{' '}
                <span className="font-semibold">{formatRateDollars(preview.chargeRate)} / hr</span>
              </p>
            </div>

            {!preview.actionable && (
              <div className="rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-3 text-sm text-onix-700">
                <p className="font-medium">This request has already been decided.</p>
                {preview.decidedByName && (
                  <p className="mt-1 text-onix-600">
                    {preview.status === 'approved' ? 'Approved' : 'Changes requested'} by{' '}
                    {preview.decidedByName}
                  </p>
                )}
                {preview.decisionReason && (
                  <p className="mt-2 text-onix-600">Reason: {preview.decisionReason}</p>
                )}
              </div>
            )}

            {preview.actionable && !done && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-onix-600" htmlFor="decider-name">
                    Your name
                  </label>
                  <input
                    id="decider-name"
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm"
                  />
                </div>

                {mode === 'approve' && (
                  <label className="flex items-start gap-2 text-sm text-onix-700">
                    <input
                      type="checkbox"
                      checked={confirmChecked}
                      onChange={e => setConfirmChecked(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>I confirm approval of this labor rate for {preview.shopName}.</span>
                  </label>
                )}

                {mode === 'changes_requested' && (
                  <div>
                    <label className="block text-xs font-medium text-onix-600" htmlFor="reason">
                      Reason (required)
                    </label>
                    <textarea
                      id="reason"
                      required
                      rows={4}
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : mode === 'approve' ? 'Approve' : 'Request changes'}
                </button>
              </form>
            )}

            {done && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Thank you — your decision has been recorded.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
