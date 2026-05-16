'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ConsultCaseStatusBadge from '@/components/expert-assist/ConsultCaseStatusBadge'
import { computeConsultBillUsd } from '@/lib/expert-assist/billing'
import type { ConsultCaseStatus, ConsultMessageRow, ConsultQueueRow } from '@/lib/expert-assist/types'
import { CONSULT_OUTCOME_LABELS, CONSULT_OUTCOMES_FILTER } from '@/lib/expert-assist/types'

export type CaseDetailModel = ConsultQueueRow & {
  expert_notes: string | null
  outcome: string | null
  closed_at: string | null
  originating_contact_id: string | null
}

function MessageBubble({ m }: { m: ConsultMessageRow }) {
  const isSystem = m.direction === 'system'
  const isOut = m.direction === 'outbound'
  const urls = m.media_display_urls ?? m.media_urls ?? []
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <p className="max-w-[90%] rounded-md bg-arctic-100 px-3 py-2 text-center text-xs italic text-onix-600">
          {m.body ?? '(no text)'}
        </p>
      </div>
    )
  }
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} py-1`}>
      <div
        className={
          isOut ?
            'max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white'
          : 'max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-arctic-200 bg-white px-3 py-2 text-sm text-onix-900 shadow-sm'
        }
      >
        {urls.length ?
          <ul className="mb-2 space-y-1 text-xs opacity-90">
            {urls.map((url, i) => (
              <li key={`${m.id}-${i}`}>
                <a href={url} className="underline" target="_blank" rel="noreferrer">
                  Attachment {urls.length > 1 ? i + 1 : ''}
                </a>
              </li>
            ))}
          </ul>
        : null}
        <p className="whitespace-pre-wrap">{m.body ?? ''}</p>
        <p className={`mt-1 text-[10px] ${isOut ? 'text-brand-100' : 'text-onix-500'}`}>
          {new Date(m.created_at).toLocaleString()} · {m.delivery_status}
        </p>
      </div>
    </div>
  )
}

export default function ConsultCaseDetail({
  caseId,
  caseRow,
  messages,
}: {
  caseId: string
  caseRow: CaseDetailModel
  messages: ConsultMessageRow[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState(caseRow.expert_notes ?? '')
  const [outcome, setOutcome] = useState(caseRow.outcome ?? '')
  const [vin, setVin] = useState(caseRow.vin ?? '')
  const [billableOverride, setBillableOverride] = useState('')

  useEffect(() => {
    setNotes(caseRow.expert_notes ?? '')
    setOutcome(caseRow.outcome ?? '')
    setVin(caseRow.vin ?? '')
  }, [caseRow.expert_notes, caseRow.outcome, caseRow.vin])

  const billPreview = useMemo(() => {
    const secs = caseRow.billable_seconds ?? 0
    return computeConsultBillUsd(secs)
  }, [caseRow.billable_seconds])

  const needsApproval = caseRow.status === 'awaiting_expert_approval'
  const isOpen = caseRow.status === 'open'
  const readOnly = caseRow.status === 'closed' || caseRow.status === 'cancelled' || caseRow.status === 'billing_failed'

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 12000)
    return () => window.clearInterval(t)
  }, [router])

  async function postJson(url: string, body?: object) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? res.statusText)
    return data
  }

  async function patchJson(url: string, body: object) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? res.statusText)
    return data
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-arctic-200 lg:border-r lg:border-b-0">
        {needsApproval ?
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <span className="font-medium text-amber-950">Pending approval for this number.</span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy('approve')
                  try {
                    await postJson(`/api/consults/${caseId}/approve`)
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Approve failed')
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'approve' ? 'Working…' : 'Approve & open'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  if (!window.confirm('Reject this claim?')) return
                  setBusy('reject')
                  try {
                    await postJson(`/api/consults/${caseId}/reject`, {})
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Reject failed')
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
              className="rounded-md border border-arctic-300 bg-white px-3 py-1.5 text-xs font-semibold text-onix-800 disabled:opacity-50"
            >
              {busy === 'reject' ? 'Working…' : 'Reject'}
            </button>
          </div>
        : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ?
            <p className="text-center text-sm text-onix-500">No messages yet.</p>
          : messages.map(m => <MessageBubble key={m.id} m={m} />)}
        </div>

        <div className="border-t border-arctic-200 bg-arctic-50/80 p-4">
          <label className="sr-only" htmlFor="consult-reply">
            Reply
          </label>
          <textarea
            id="consult-reply"
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={!isOpen || sending}
            placeholder={isOpen ? 'Type a reply to the shop…' : 'Open this consult to send SMS.'}
            className="w-full resize-none rounded-md border border-arctic-200 bg-white px-3 py-2 text-sm text-onix-900 placeholder:text-onix-400 disabled:cursor-not-allowed disabled:bg-arctic-50"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={!isOpen || sending || !draft.trim()}
              onClick={() => {
                void (async () => {
                  setSending(true)
                  try {
                    await postJson(`/api/consults/${caseId}/messages`, { text: draft })
                    setDraft('')
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Send failed')
                  } finally {
                    setSending(false)
                  }
                })()
              }}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 overflow-y-auto bg-white lg:w-80 xl:w-96">
        <div className="space-y-4 border-b border-arctic-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ConsultCaseStatusBadge status={caseRow.status as ConsultCaseStatus} />
            {caseRow.delivery_attention ?
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">Delivery issue</span>
            : null}
            {caseRow.closed_at ?
              <span className="text-xs text-onix-500">Closed {new Date(caseRow.closed_at).toLocaleString()}</span>
            : null}
          </div>
          {caseRow.shop_id ?
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-onix-500">Shop</p>
              <p className="mt-0.5 font-medium text-onix-950">{caseRow.shop?.name ?? '—'}</p>
              <Link href={`/shops/${caseRow.shop_id}`} className="mt-1 inline-block text-sm text-brand-700 hover:underline">
                Open shop in CRM
              </Link>
            </div>
          : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-onix-500">Contact</p>
            <p className="mt-0.5 text-sm text-onix-800">
              {caseRow.contact?.display_name ? `${caseRow.contact.display_name} · ` : ''}
              <span className="font-mono text-xs">{caseRow.contact?.phone_number ?? caseRow.originating_phone_number}</span>
            </p>
            {caseRow.contact?.status ?
              <p className="mt-0.5 text-xs text-onix-500">Contact status: {caseRow.contact.status}</p>
            : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-onix-500">Vehicle</p>
            <p className="mt-0.5 text-sm tabular-nums text-onix-800">
              {[caseRow.year, caseRow.model, caseRow.trim].filter(Boolean).join(' ') || '—'}
            </p>
            <label className="mt-1 block text-xs text-onix-600">
              VIN
              <input
                value={vin}
                onChange={e => setVin(e.target.value)}
                disabled={readOnly}
                className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1 font-mono text-xs disabled:bg-arctic-50"
              />
            </label>
            {!readOnly ?
              <button
                type="button"
                className="mt-1 text-xs text-brand-700 hover:underline"
                onClick={() => {
                  void (async () => {
                    try {
                      await patchJson(`/api/consults/${caseId}`, { vin: vin.trim() || null })
                      refresh()
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : 'Save failed')
                    }
                  })()
                }}
              >
                Save VIN
              </button>
            : null}
          </div>
        </div>

        <div className="space-y-3 border-b border-arctic-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-onix-500">Timer</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!isOpen || busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy('timer')
                  try {
                    await postJson(`/api/consults/${caseId}/timer`, { action: 'start' })
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Timer failed')
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
              className="rounded-md border border-arctic-200 px-2 py-1 text-xs disabled:opacity-50"
            >
              Start
            </button>
            <button
              type="button"
              disabled={!isOpen || busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy('timer')
                  try {
                    await postJson(`/api/consults/${caseId}/timer`, { action: 'pause' })
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Timer failed')
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
              className="rounded-md border border-arctic-200 px-2 py-1 text-xs disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              disabled={!isOpen || busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy('timer')
                  try {
                    await postJson(`/api/consults/${caseId}/timer`, { action: 'stop' })
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Timer failed')
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
              className="rounded-md border border-arctic-200 px-2 py-1 text-xs disabled:opacity-50"
            >
              Stop
            </button>
          </div>
          <p className="text-xs text-onix-600">
            Billable seconds (recorded): <span className="font-mono font-medium">{caseRow.billable_seconds ?? 0}</span>
          </p>
          <p className="text-xs text-onix-600">
            Preview charge from timer: <span className="font-medium">{billPreview.label}</span>
          </p>
        </div>

        <div className="space-y-3 p-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-onix-500">Expert notes</span>
            <textarea
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={readOnly}
              className="mt-1 w-full resize-none rounded-md border border-arctic-200 bg-white px-2 py-1.5 text-sm text-onix-700 disabled:bg-arctic-50"
            />
          </label>
          {!readOnly ?
            <button
              type="button"
              className="text-xs text-brand-700 hover:underline"
              onClick={() => {
                void (async () => {
                  try {
                    await patchJson(`/api/consults/${caseId}`, { expert_notes: notes })
                    refresh()
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Save failed')
                  }
                })()
              }}
            >
              Save notes
            </button>
          : null}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-onix-500">Outcome (required to close)</span>
            <select
              className="mt-1 w-full rounded-md border border-arctic-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
              disabled={readOnly}
              value={outcome}
              onChange={e => {
                const v = e.target.value
                setOutcome(v)
                void (async () => {
                  try {
                    await patchJson(`/api/consults/${caseId}`, { outcome: v || null })
                    refresh()
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : 'Save failed')
                  }
                })()
              }}
            >
              <option value="">Select…</option>
              {CONSULT_OUTCOMES_FILTER.map(k => (
                <option key={k} value={k}>
                  {CONSULT_OUTCOME_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {!readOnly ?
            <label className="block text-xs text-onix-600">
              Override billable seconds (optional, for close)
              <input
                type="number"
                min={0}
                value={billableOverride}
                onChange={e => setBillableOverride(e.target.value)}
                placeholder="Use timer total by default"
                className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1 text-sm"
              />
            </label>
          : null}
          <button
            type="button"
            disabled={readOnly || !isOpen || busy !== null || !outcome}
            onClick={() => {
              void (async () => {
                setBusy('close')
                try {
                  const ov = billableOverride.trim() ? Number.parseInt(billableOverride, 10) : undefined
                  await postJson(`/api/consults/${caseId}/close`, {
                    billable_seconds_override: Number.isFinite(ov) ? ov : null,
                  })
                  refresh()
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : 'Close failed')
                } finally {
                  setBusy(null)
                }
              })()
            }}
            className="w-full rounded-md bg-onix-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'close' ? 'Closing…' : 'Close case & charge'}
          </button>
        </div>
      </aside>
    </div>
  )
}
