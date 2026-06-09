'use client'

import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { crmInputNoAutofillProps } from '@/lib/crm-no-autofill'

type SearchPayload = {
  shops: Array<{ id: string; name: string; status: string | null }>
  contacts: Array<{ id: string; name: string; email: string | null; shop_id: string; shop_name: string }>
  accounts: Array<{ id: string; name: string; shop_id: string; shop_name: string }>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string) {
  const q = query.trim()
  if (q.length < 2) return text
  const pattern = new RegExp(`(${escapeRegExp(q)})`, 'ig')
  const parts = text.split(pattern)
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={`${part}-${idx}`} className="bg-transparent font-semibold text-brand-700">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    ),
  )
}

function statusPill(status: string | null | undefined): string {
  const normalized = (status ?? '').toLowerCase()
  if (normalized === 'active') return 'bg-emerald-100 text-emerald-800'
  if (normalized === 'inactive') return 'bg-zinc-200 text-zinc-700'
  return 'bg-arctic-100 text-onix-600'
}

type Props = {
  open: boolean
  onClose: () => void
  enrolledLocationIds: Set<string>
  enrollingLocationId: string | null
  onEnroll: (locationId: string) => Promise<void>
  errorMessage: string | null
}

export default function ExpertAssistEnrollSearchModal({
  open,
  onClose,
  enrolledLocationIds,
  enrollingLocationId,
  onEnroll,
  errorMessage,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchPayload>({ shops: [], contacts: [], accounts: [] })
  const activeRequestRef = useRef(0)

  const hasTypedQuery = debouncedQuery.trim().length >= 2

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebouncedQuery('')
    setResults({ shops: [], contacts: [], accounts: [] })
    setLoading(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    if (debouncedQuery.length < 2) {
      setLoading(false)
      setResults({ shops: [], contacts: [], accounts: [] })
      return
    }
    const requestId = activeRequestRef.current + 1
    activeRequestRef.current = requestId
    setLoading(true)

    const controller = new AbortController()
    const url = `/search?q=${encodeURIComponent(debouncedQuery)}&context=vinfast-enroll`
    void fetch(url, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error('Search request failed')
        const data = (await res.json()) as SearchPayload
        if (activeRequestRef.current !== requestId) return
        setResults({
          shops: Array.isArray(data.shops) ? data.shops : [],
          contacts: Array.isArray(data.contacts) ? data.contacts : [],
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
        })
      })
      .catch(() => {
        if (activeRequestRef.current === requestId) {
          setResults({ shops: [], contacts: [], accounts: [] })
        }
      })
      .finally(() => {
        if (activeRequestRef.current === requestId) setLoading(false)
      })

    return () => controller.abort()
  }, [debouncedQuery, open])

  if (!open) return null

  const showNoResults =
    hasTypedQuery && !loading && results.shops.length + results.contacts.length + results.accounts.length === 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16 sm:pt-24"
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ea-enroll-modal-title"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-arctic-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-arctic-200 px-4 py-3">
          <h2 id="ea-enroll-modal-title" className="text-base font-semibold text-onix-900">
            Add shop to activation funnel
          </h2>
          <p className="mt-1 text-sm text-onix-500">Search for a shop to track in the Expert Assist funnel.</p>
          {errorMessage ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-b border-arctic-200 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-onix-400" aria-hidden />
          <input
            ref={inputRef}
            id="ea-enroll-search"
            name="ea_enroll_search_query"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-autocomplete="list"
            aria-controls="ea-enroll-results"
            {...crmInputNoAutofillProps}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Shop name, person, business…"
            className="min-w-0 flex-1 bg-transparent text-base text-onix-900 placeholder:text-onix-400 focus:outline-none"
          />
        </div>

        <div id="ea-enroll-results" className="max-h-[min(420px,55vh)] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-onix-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Searching…
            </div>
          )}

          {!hasTypedQuery && !loading && (
            <p className="px-4 py-8 text-center text-sm text-onix-500">Type at least 2 characters to search.</p>
          )}

          {hasTypedQuery && results.shops.length > 0 && (
            <section className="border-t border-arctic-100 first:border-t-0">
              <h3 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Shops</h3>
              <ul className="divide-y divide-arctic-100">
                {results.shops.map(shop => (
                  <EnrollRow
                    key={shop.id}
                    title={shop.name}
                    titleQuery={debouncedQuery}
                    subtitle={null}
                    status={shop.status}
                    enrolled={enrolledLocationIds.has(shop.id)}
                    busy={enrollingLocationId === shop.id}
                    onEnroll={() => void onEnroll(shop.id)}
                    secondaryAction={
                      <Link
                        href={`/shops/${shop.id}?tab=expert-assist`}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-onix-600 hover:bg-arctic-100"
                        onClick={onClose}
                      >
                        View
                      </Link>
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {hasTypedQuery && results.contacts.length > 0 && (
            <section className="border-t border-arctic-100">
              <h3 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Contacts</h3>
              <ul className="divide-y divide-arctic-100">
                {results.contacts.map(c => (
                  <EnrollRow
                    key={`c-${c.id}`}
                    title={c.name}
                    titleQuery={debouncedQuery}
                    subtitle={[c.shop_name, c.email].filter(Boolean).join(' · ')}
                    status={null}
                    enrolled={enrolledLocationIds.has(c.shop_id)}
                    busy={enrollingLocationId === c.shop_id}
                    onEnroll={() => void onEnroll(c.shop_id)}
                    secondaryAction={
                      <Link
                        href={`/shops/${c.shop_id}?tab=expert-assist`}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-onix-600 hover:bg-arctic-100"
                        onClick={onClose}
                      >
                        View
                      </Link>
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {hasTypedQuery && results.accounts.length > 0 && (
            <section className="border-t border-arctic-100">
              <h3 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Accounts</h3>
              <ul className="divide-y divide-arctic-100">
                {results.accounts.map(a => (
                  <EnrollRow
                    key={`a-${a.id}`}
                    title={a.name}
                    titleQuery={debouncedQuery}
                    subtitle={a.shop_name}
                    status={null}
                    enrolled={enrolledLocationIds.has(a.shop_id)}
                    busy={enrollingLocationId === a.shop_id}
                    onEnroll={() => void onEnroll(a.shop_id)}
                    secondaryAction={
                      <Link
                        href={`/shops/${a.shop_id}?tab=expert-assist`}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-onix-600 hover:bg-arctic-100"
                        onClick={onClose}
                      >
                        View
                      </Link>
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {showNoResults && (
            <div className="border-t border-arctic-100 px-4 py-10 text-center">
              <p className="text-sm font-medium text-onix-800">No results for &quot;{debouncedQuery}&quot;</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-arctic-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-onix-600 hover:bg-arctic-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function EnrollRow({
  title,
  titleQuery,
  subtitle,
  status,
  enrolled,
  busy,
  onEnroll,
  secondaryAction,
}: {
  title: string
  titleQuery: string
  subtitle: string | null
  status: string | null
  enrolled: boolean
  busy: boolean
  onEnroll: () => void
  secondaryAction: ReactNode
}) {
  return (
    <li className="flex items-center gap-2 px-4 py-3 hover:bg-arctic-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-onix-900">{highlightText(title, titleQuery)}</p>
        {subtitle ? (
          <p className="truncate text-xs text-onix-500">{highlightText(subtitle, titleQuery)}</p>
        ) : null}
      </div>
      {status ? (
        <span
          className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${statusPill(status)}`}
        >
          {status === 'inactive' ? 'Inactive' : status === 'active' ? 'Active' : status}
        </span>
      ) : null}
      {secondaryAction}
      <button
        type="button"
        disabled={enrolled || busy}
        onClick={onEnroll}
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-arctic-300 disabled:text-onix-500"
      >
        {busy ? '…' : enrolled ? 'On funnel' : 'Add'}
      </button>
    </li>
  )
}
