'use client'

import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { buildLaborRateEmailPreview } from '@/lib/labor-rate-approval/email-content'
import { formatRateDollars } from '@/lib/labor-rate-approval/sla'
import type { VinfastEnrollmentView } from '@/lib/vinfast-enrollments'

type Props = {
  card: VinfastEnrollmentView
  onClose: () => void
  onSubmitted: () => void
}

export default function LaborRateApprovalModal({ card, onClose, onSubmitted }: Props) {
  const initialCharge =
    card.laborRateApproval?.chargeRate != null && card.laborRateApproval.chargeRate > 0
      ? String(card.laborRateApproval.chargeRate)
      : ''
  const [chargeRate, setChargeRate] = useState(initialCharge)
  const [benchmarkAverage, setBenchmarkAverage] = useState('')
  const [benchmarkShopsSurveyed, setBenchmarkShopsSurveyed] = useState('')
  const [pullingBenchmarks, setPullingBenchmarks] = useState(false)
  const [excludeBenchmarksFromEmail, setExcludeBenchmarksFromEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locationLine = [card.city, card.state].filter(Boolean).join(', ')
  const warrantyDisplay =
    card.warrantyLaborRate != null && Number.isFinite(card.warrantyLaborRate)
      ? formatRateDollars(card.warrantyLaborRate)
      : '—'

  const chargeNum = Number(chargeRate)
  const chargeValid = chargeRate.trim() !== '' && Number.isFinite(chargeNum) && chargeNum > 0

  const benchmarkAvgNum = Number(benchmarkAverage)
  const benchmarkCountNum = Number(benchmarkShopsSurveyed)
  const benchmarkAvgValid =
    benchmarkAverage.trim() !== '' && Number.isFinite(benchmarkAvgNum) && benchmarkAvgNum > 0
  const benchmarkCountValid =
    benchmarkShopsSurveyed.trim() !== '' && Number.isFinite(benchmarkCountNum) && benchmarkCountNum > 0
  const benchmarkCountRounded = benchmarkCountValid ? Math.round(benchmarkCountNum) : null
  const includeBenchmarksInEmail =
    !excludeBenchmarksFromEmail && benchmarkAvgValid && benchmarkCountValid

  const emailPreview = useMemo(() => {
    if (!chargeValid) {
      return {
        subject: `Labor rate approval · ${card.locationName}`,
        body: 'Enter a charge rate to preview the email.',
        bodyHtml: '<p>Enter a charge rate to preview the email.</p>',
      }
    }
    return buildLaborRateEmailPreview({
      shopName: card.locationName,
      city: card.city,
      state: card.state,
      chargeRate: chargeNum,
      decisionToken: '…',
      submittedAt: new Date().toISOString(),
      benchmarkAverageRate: includeBenchmarksInEmail ? benchmarkAvgNum : null,
      benchmarkShopsSurveyed: includeBenchmarksInEmail ? benchmarkCountRounded : null,
    })
  }, [card, chargeNum, chargeValid, benchmarkAvgNum, includeBenchmarksInEmail, benchmarkCountRounded])

  async function handlePullBenchmarks() {
    setPullingBenchmarks(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/labor-rate-approvals/benchmarks?location_id=${encodeURIComponent(card.locationId)}`,
      )
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        average_rate?: number | null
        shops_surveyed?: number
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to pull benchmarks')

      if (data.average_rate == null || !data.shops_surveyed) {
        setBenchmarkAverage('')
        setBenchmarkShopsSurveyed('0')
        setError('No nearby shops with customer-pay labor rates found within 100 miles.')
        return
      }

      setBenchmarkAverage(String(Math.round(data.average_rate)))
      setBenchmarkShopsSurveyed(String(data.shops_surveyed))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull benchmarks')
    } finally {
      setPullingBenchmarks(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!chargeValid) {
      setError('VinFast charge rate is required and must be greater than 0')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/labor-rate-approvals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: card.locationId,
          charge_rate: chargeNum,
          benchmark_average_rate: includeBenchmarksInEmail ? benchmarkAvgNum : null,
          benchmark_shops_surveyed: includeBenchmarksInEmail ? benchmarkCountRounded : null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Submit failed')
      onSubmitted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-arctic-200 bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-onix-950">Submit for labor rate approval</h2>
        <p className="mt-1 text-sm text-onix-600">
          {card.locationName}
          {locationLine ? ` · ${locationLine}` : ''}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-onix-600">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Warranty rate
            </label>
            <p className="mt-0.5 text-xs text-onix-500">From CRM, before markup — provided for context.</p>
            <div className="mt-1 rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2 text-sm text-onix-800">
              {warrantyDisplay}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-onix-600" htmlFor="charge-rate">
              VinFast charge rate <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-onix-500">Includes our markup. Shown to the approver as &quot;labor rate.&quot;</p>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-onix-500">
                $
              </span>
              <input
                id="charge-rate"
                type="text"
                inputMode="decimal"
                required
                value={chargeRate}
                onChange={e => setChargeRate(e.target.value)}
                className="w-full rounded-lg border border-arctic-300 py-2 pl-7 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-arctic-200 bg-arctic-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-onix-600">Regional benchmarks</p>
              <button
                type="button"
                onClick={handlePullBenchmarks}
                disabled={pullingBenchmarks}
                className="rounded-lg border border-arctic-300 bg-white px-3 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
              >
                {pullingBenchmarks ? 'Pulling…' : 'Pull benchmarks'}
              </button>
            </div>
            <p className="mt-1 text-xs text-onix-500">
              10 nearest shops within 100 miles with customer-pay labor rates. Editable before send.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-onix-600" htmlFor="benchmark-average">
                  Average labor rate benchmark
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-onix-500">
                    $
                  </span>
                  <input
                    id="benchmark-average"
                    type="text"
                    inputMode="decimal"
                    value={benchmarkAverage}
                    onChange={e => setBenchmarkAverage(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-arctic-300 bg-white py-2 pl-7 pr-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-onix-600" htmlFor="benchmark-count">
                  Number of shops surveyed
                </label>
                <input
                  id="benchmark-count"
                  type="text"
                  inputMode="numeric"
                  value={benchmarkShopsSurveyed}
                  onChange={e => setBenchmarkShopsSurveyed(e.target.value)}
                  placeholder="—"
                  className="mt-1 w-full rounded-lg border border-arctic-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-onix-700">
              <input
                type="checkbox"
                checked={excludeBenchmarksFromEmail}
                onChange={e => setExcludeBenchmarksFromEmail(e.target.checked)}
                className="h-4 w-4 rounded border-arctic-300 text-brand-600 focus:ring-brand-500"
              />
              Exclude benchmarks from email
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-onix-600">Email preview</p>
            <div className="mt-1 rounded-lg border border-arctic-200 bg-arctic-50 p-3 text-xs text-onix-800">
              <p className="font-medium">Subject: {emailPreview.subject}</p>
              <div
                className="mt-2 space-y-1 font-sans text-onix-700 [&_a]:text-brand-600 [&_a]:underline hover:[&_a]:text-brand-700"
                dangerouslySetInnerHTML={{ __html: emailPreview.bodyHtml }}
              />
            </div>
          </div>

          <p className="text-xs text-onix-500">
            7-day SLA starts on send · reminders on days 3,5,6 and 7 · escalates day 7.
          </p>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}


          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-arctic-300 px-4 py-2 text-sm text-onix-700 hover:bg-arctic-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !chargeValid}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
