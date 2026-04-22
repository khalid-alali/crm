'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { readRecentShops, writeRecentShop, type RecentShop } from '@/lib/recent-shops'

type SearchPayload = {
  shops: Array<{ id: string; name: string; status: string | null }>
  contacts: Array<{ id: string; name: string; email: string | null; shop_id: string; shop_name: string }>
  accounts: Array<{ id: string; name: string; shop_id: string; shop_name: string }>
}

type SearchRow = {
  key: string
  group: 'Shops' | 'Contacts' | 'Accounts'
  title: string
  subtitle?: string
  href: string
  recentShop?: {
    id: string
    name: string
    status: string | null
    city: string | null
    state: string | null
  }
  status?: string | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function statusPill(status: string | null | undefined): string {
  const normalized = (status ?? '').toLowerCase()
  if (normalized === 'active') return 'bg-emerald-100 text-emerald-800'
  if (normalized === 'inactive') return 'bg-zinc-200 text-zinc-700'
  return 'bg-arctic-100 text-onix-600'
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

export default function GlobalSearch() {
  const router = useRouter()
  const pathname = usePathname()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchPayload>({ shops: [], contacts: [], accounts: [] })
  const [recentShops, setRecentShops] = useState<RecentShop[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [shortcutLabel, setShortcutLabel] = useState('⌘K')
  const activeRequestRef = useRef(0)

  const hasTypedQuery = debouncedQuery.trim().length >= 2

  useEffect(() => {
    const platform = typeof window !== 'undefined' ? window.navigator.platform.toLowerCase() : ''
    setShortcutLabel(platform.includes('mac') ? '⌘K' : 'Ctrl+K')
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setRecentShops(readRecentShops())
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
    setSelectedIndex(0)
  }, [open, pathname])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    if (debouncedQuery.length < 2) {
      setLoading(false)
      return
    }
    const requestId = activeRequestRef.current + 1
    activeRequestRef.current = requestId
    setLoading(true)

    const controller = new AbortController()
    void fetch(`/search?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
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
        // Silent fail so the command palette remains usable.
      })
      .finally(() => {
        if (activeRequestRef.current === requestId) setLoading(false)
      })

    return () => controller.abort()
  }, [debouncedQuery, open])

  const rowsByGroup = useMemo(() => {
    const shops: SearchRow[] = hasTypedQuery
      ? results.shops.map(shop => ({
          key: `shop-${shop.id}`,
          group: 'Shops',
          title: shop.name,
          href: `/shops/${shop.id}`,
          status: shop.status,
          recentShop: {
            id: shop.id,
            name: shop.name,
            status: shop.status,
            city: null,
            state: null,
          },
        }))
      : recentShops.map(shop => ({
          key: `recent-${shop.id}`,
          group: 'Shops',
          title: shop.name,
          subtitle: [shop.city, shop.state].filter(Boolean).join(', '),
          href: `/shops/${shop.id}`,
          status: shop.status,
          recentShop: {
            id: shop.id,
            name: shop.name,
            status: shop.status,
            city: shop.city,
            state: shop.state,
          },
        }))

    const contacts: SearchRow[] = hasTypedQuery
      ? results.contacts.map(contact => ({
          key: `contact-${contact.id}`,
          group: 'Contacts',
          title: contact.name,
          subtitle: [contact.shop_name, contact.email].filter(Boolean).join(' · '),
          href: `/shops/${contact.shop_id}`,
          recentShop: {
            id: contact.shop_id,
            name: contact.shop_name,
            status: null,
            city: null,
            state: null,
          },
        }))
      : []

    const accounts: SearchRow[] = hasTypedQuery
      ? results.accounts.map(account => ({
          key: `account-${account.id}`,
          group: 'Accounts',
          title: account.name,
          subtitle: account.shop_name,
          href: `/shops/${account.shop_id}`,
          recentShop: {
            id: account.shop_id,
            name: account.shop_name,
            status: null,
            city: null,
            state: null,
          },
        }))
      : []

    return { shops, contacts, accounts }
  }, [hasTypedQuery, recentShops, results.accounts, results.contacts, results.shops])

  const allRows = useMemo(
    () => [...rowsByGroup.shops, ...rowsByGroup.contacts, ...rowsByGroup.accounts],
    [rowsByGroup.accounts, rowsByGroup.contacts, rowsByGroup.shops],
  )

  useEffect(() => {
    if (allRows.length === 0) {
      setSelectedIndex(0)
      return
    }
    setSelectedIndex(prev => Math.min(prev, allRows.length - 1))
  }, [allRows.length])

  function close() {
    setOpen(false)
  }

  function goToRow(row: SearchRow) {
    if (row.recentShop) writeRecentShop(row.recentShop)
    setRecentShops(readRecentShops())
    close()
    router.push(row.href)
  }

  function onOverlayKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (allRows.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(prev => (prev + 1) % allRows.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(prev => (prev - 1 + allRows.length) % allRows.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const row = allRows[selectedIndex]
      if (row) goToRow(row)
    }
  }

  const showNoResults = hasTypedQuery && !loading && allRows.length === 0
  const showRecent = !hasTypedQuery

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-arctic-200 bg-white px-3 py-1.5 text-sm text-onix-700 shadow-sm hover:bg-arctic-50"
        aria-label="Open global search"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span>Search</span>
        <kbd className="rounded border border-arctic-200 bg-arctic-50 px-1.5 py-0.5 text-[11px] text-onix-500">
          {shortcutLabel}
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/25 p-4 pt-20"
          onClick={close}
          onKeyDown={onOverlayKeyDown}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-arctic-300 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-arctic-200 px-4 py-3">
              <Search className="h-4 w-4 text-onix-400" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search shops, contacts, accounts..."
                className="flex-1 bg-transparent text-lg text-onix-900 placeholder:text-onix-400 focus:outline-none"
              />
              <kbd className="rounded border border-arctic-300 bg-arctic-50 px-1.5 py-0.5 text-xs text-onix-500">
                esc
              </kbd>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-onix-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Searching...
                </div>
              )}

              {showRecent && (
                <ResultGroup
                  title="Recent"
                  rows={rowsByGroup.shops}
                  selectedIndex={selectedIndex}
                  allRows={allRows}
                  query={query}
                  onSelect={goToRow}
                />
              )}

              {hasTypedQuery && rowsByGroup.shops.length > 0 && (
                <ResultGroup
                  title="Shops"
                  rows={rowsByGroup.shops}
                  selectedIndex={selectedIndex}
                  allRows={allRows}
                  query={debouncedQuery}
                  onSelect={goToRow}
                />
              )}

              {hasTypedQuery && rowsByGroup.contacts.length > 0 && (
                <ResultGroup
                  title="Contacts"
                  rows={rowsByGroup.contacts}
                  selectedIndex={selectedIndex}
                  allRows={allRows}
                  query={debouncedQuery}
                  onSelect={goToRow}
                />
              )}

              {hasTypedQuery && rowsByGroup.accounts.length > 0 && (
                <ResultGroup
                  title="Accounts"
                  rows={rowsByGroup.accounts}
                  selectedIndex={selectedIndex}
                  allRows={allRows}
                  query={debouncedQuery}
                  onSelect={goToRow}
                />
              )}

              {showNoResults && (
                <div className="border-t border-arctic-100 px-4 py-12 text-center">
                  <p className="text-lg font-semibold text-onix-800">No results for "{debouncedQuery}"</p>
                  <p className="mt-1 text-sm text-onix-500">Try a shop name, contact name, or email</p>
                  <Link
                    href="/shops/new"
                    className="mt-4 inline-flex rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                    onClick={() => close()}
                  >
                    Add new shop
                  </Link>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-arctic-200 px-3 py-2 text-xs text-onix-500">
              {allRows.length > 0 && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-arctic-300 bg-arctic-50 px-1.5 py-0.5">↑↓</kbd>
                    navigate
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-arctic-300 bg-arctic-50 px-1.5 py-0.5">↵</kbd>
                    open
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-arctic-300 bg-arctic-50 px-1.5 py-0.5">esc</kbd>
                close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ResultGroup({
  title,
  rows,
  selectedIndex,
  allRows,
  query,
  onSelect,
}: {
  title: string
  rows: SearchRow[]
  selectedIndex: number
  allRows: SearchRow[]
  query: string
  onSelect: (row: SearchRow) => void
}) {
  if (rows.length === 0) return null

  return (
    <section className="border-t border-arctic-100 first:border-t-0">
      <h3 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-onix-500">{title}</h3>
      <ul>
        {rows.map(row => {
          const absoluteIdx = allRows.findIndex(r => r.key === row.key)
          const selected = absoluteIdx === selectedIndex
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={`flex w-full items-center justify-between border-l-2 px-4 py-2.5 text-left hover:bg-arctic-50 ${
                  selected ? 'border-l-brand-600 bg-arctic-50' : 'border-l-transparent'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-onix-900">{highlightText(row.title, query)}</p>
                  {row.subtitle ? (
                    <p className="truncate text-sm text-onix-500">{highlightText(row.subtitle, query)}</p>
                  ) : null}
                </div>
                {row.status ? (
                  <span
                    className={`ml-4 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusPill(row.status)}`}
                  >
                    {row.status === 'inactive' ? 'Inactive' : row.status === 'active' ? 'Active' : row.status}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
