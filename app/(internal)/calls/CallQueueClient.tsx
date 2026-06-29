'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { formatPhoneDisplay } from '@/lib/phone'
import type { PickerLocation } from '@/app/api/locations/picker-search/route'

export type QueuedCall = {
  callId: number
  direction: string | null
  rwUserName: string | null
  externalNumber: string | null
  startedAt: string | null
  duration: string | null
  summary: string | null
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function CallQueueClient({ initialCalls }: { initialCalls: QueuedCall[] }) {
  const [calls, setCalls] = useState(initialCalls)
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function removeCall(callId: number) {
    setCalls(prev => prev.filter(c => c.callId !== callId))
  }

  async function assign(callId: number, locationId: string) {
    setBusy(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed to assign')
      setPickerFor(null)
      removeCall(callId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign')
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(callId: number) {
    setBusy(callId)
    setError(null)
    try {
      const res = await fetch(`/api/calls/${callId}/dismiss`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed to dismiss')
      removeCall(callId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss')
    } finally {
      setBusy(null)
    }
  }

  if (calls.length === 0) {
    return (
      <div className="rounded-lg border border-arctic-200 bg-white p-8 text-center">
        <Phone className="mx-auto h-6 w-6 text-onix-300" aria-hidden />
        <p className="mt-2 text-sm font-medium text-onix-700">Queue is clear</p>
        <p className="text-sm text-onix-400">Every recent call matched a shop automatically.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {calls.map(call => {
        const DirIcon =
          call.direction === 'inbound' ? PhoneIncoming : call.direction === 'outbound' ? PhoneOutgoing : Phone
        const isBusy = busy === call.callId
        return (
          <div key={call.callId} className="rounded-lg border border-arctic-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                    <DirIcon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-onix-950">
                    {formatPhoneDisplay(call.externalNumber) ?? call.externalNumber ?? 'Unknown number'}
                  </span>
                  <span className="text-xs text-onix-400">
                    {formatWhen(call.startedAt)}
                    {call.duration ? ` · ${call.duration}` : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-onix-500">
                  {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                  {call.rwUserName ? ` · handled by ${call.rwUserName}` : ''}
                </p>
                {call.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm text-onix-700">{call.summary}</p>
                ) : (
                  <p className="mt-2 text-sm italic text-onix-400">Summary still processing…</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setPickerFor(pickerFor === call.callId ? null : call.callId)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Assign to shop
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void dismiss(call.callId)}
                  className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
                >
                  Not a shop
                </button>
              </div>
            </div>
            {pickerFor === call.callId ? (
              <ShopPicker disabled={isBusy} onPick={loc => void assign(call.callId, loc.id)} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ShopPicker({ onPick, disabled }: { onPick: (loc: PickerLocation) => void; disabled: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickerLocation[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/locations/picker-search?q=${encodeURIComponent(q)}`)
        const data = (await res.json().catch(() => ({}))) as { results?: PickerLocation[] }
        setResults(data.results ?? [])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  return (
    <div className="mt-3 border-t border-arctic-100 pt-3">
      <input
        type="text"
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search shops by name or chain…"
        className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
      {loading ? <p className="mt-2 text-xs text-onix-400">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="mt-2 max-h-60 divide-y divide-arctic-100 overflow-y-auto rounded-lg border border-arctic-200">
          {results.map(loc => (
            <li key={loc.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(loc)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-arctic-50 disabled:opacity-50"
              >
                <span className="font-medium text-onix-900">{loc.name}</span>
                <span className="text-xs text-onix-400">
                  {[loc.chain_name, [loc.city, loc.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 && !loading ? (
        <p className="mt-2 text-xs text-onix-400">No shops found.</p>
      ) : null}
    </div>
  )
}
