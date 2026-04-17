'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import ShopTable, { type ShopRow } from '@/components/ShopTable'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const PIPELINE_STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive'] as const

function shopMatchesQuery(shop: ShopRow, raw: string): boolean {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return true

  const fieldTexts = [
    shop.name,
    shop.city,
    shop.chain_name,
    shop.primary_owner_name,
    shop.accounts?.business_name,
  ]
    .map(f => (f ?? '').toLowerCase())

  return tokens.every(token => fieldTexts.some(text => text.includes(token)))
}

interface Props {
  title: string
  shops: ShopRow[]
  children: ReactNode
}

export default function ShopsPageClient({ title, shops, children }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const stickyToolbarRef = useRef<HTMLDivElement>(null)
  const [stickyToolbarPx, setStickyToolbarPx] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkTargetStatus, setBulkTargetStatus] = useState<string>('')
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const filtered = useMemo(
    () => shops.filter(s => shopMatchesQuery(s, query)),
    [shops, query],
  )

  useEffect(() => {
    const allow = new Set(shops.map(s => s.id))
    setSelectedIds(prev => {
      let dropped = false
      const next = new Set<string>()
      for (const id of prev) {
        if (allow.has(id)) next.add(id)
        else dropped = true
      }
      return dropped ? next : prev
    })
  }, [shops])

  const allVisibleSelected =
    filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))
  const someVisibleSelected = filtered.some(s => selectedIds.has(s.id))

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const visibleIds = filtered.map(s => s.id)
      const allOn = visibleIds.length > 0 && visibleIds.every(id => next.has(id))
      if (allOn) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      return next
    })
  }

  const selectedTargets = useMemo(
    () => shops.filter(s => selectedIds.has(s.id)),
    [shops, selectedIds],
  )

  const bulkEligibleIds = useMemo(() => {
    if (!bulkTargetStatus) return []
    return selectedTargets.filter(s => s.status !== bulkTargetStatus).map(s => s.id)
  }, [selectedTargets, bulkTargetStatus])

  const bulkSkippedSame = selectedTargets.length - bulkEligibleIds.length

  async function runBulkStatusUpdate() {
    if (!bulkTargetStatus || bulkEligibleIds.length === 0) return
    setBulkApplying(true)
    setBulkError(null)
    try {
      const res = await fetch('/api/locations/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: bulkEligibleIds, status: bulkTargetStatus }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        updated?: number
        skippedAlready?: number
        notFound?: number
      }
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setBulkConfirmOpen(false)
      setBulkTargetStatus('')
      setSelectedIds(new Set())
      router.refresh()
    } catch (e: unknown) {
      setBulkError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBulkApplying(false)
    }
  }

  useLayoutEffect(() => {
    const el = stickyToolbarRef.current
    if (!el) return

    const measure = () => setStickyToolbarPx(el.offsetHeight)

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className="min-w-0"
      style={
        { ['--pipeline-toolbar-height' as string]: `${stickyToolbarPx}px` } as CSSProperties
      }
    >
      <div
        ref={stickyToolbarRef}
        className="sticky top-0 z-20 -mx-6 border-b border-arctic-200 bg-arctic-50 px-6 pb-4 shadow-sm"
      >
        <div className="mb-4 flex items-start justify-between gap-4 pt-0">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-onix-950">{title}</h1>
            <p className="mt-1 text-sm text-onix-500">{shops.length} shops total</p>
          </div>
          <Link
            href="/shops/new"
            className="shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-base font-medium text-white hover:bg-brand-700"
          >
            + Add Shop
          </Link>
        </div>

        {children}

        <div className="mt-3">
          <div className="min-w-[280px] max-w-md">
            <label htmlFor="pipeline-shop-search" className="sr-only">
              Search shops
            </label>
            <input
              id="pipeline-shop-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search name, city, account, owner, chain..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full rounded-xl border border-arctic-300 bg-white px-4 py-2.5 text-sm text-onix-950 placeholder:text-onix-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-3 text-sm">
            <span className="font-medium text-onix-900">
              {selectedIds.size} selected
            </span>
            <span className="text-onix-500">Set status to</span>
            <select
              value={bulkTargetStatus}
              onChange={e => setBulkTargetStatus(e.target.value)}
              className="rounded-lg border border-arctic-300 bg-white px-3 py-1.5 text-onix-900"
            >
              <option value="">Choose…</option>
              {PIPELINE_STATUSES.map(s => (
                <option key={s} value={s}>
                  {LOCATION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkTargetStatus || bulkEligibleIds.length === 0}
              onClick={() => {
                setBulkError(null)
                setBulkConfirmOpen(true)
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply to selected…
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-onix-600 underline hover:text-onix-900"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-arctic-200 rounded-lg">
        <ShopTable
          shops={filtered}
          selection={{
            selectedIds,
            onToggleRow: toggleRow,
            onToggleAllVisible: toggleAllVisible,
            allVisibleSelected,
            someVisibleSelected,
          }}
        />
      </div>

      {bulkConfirmOpen && bulkTargetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-arctic-200 px-5 py-4">
              <h2 className="text-base font-semibold text-onix-950">Confirm bulk status change</h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-onix-700">
              {bulkError && <p className="text-red-600">{bulkError}</p>}
              <p>
                Update <strong>{bulkEligibleIds.length}</strong> shop
                {bulkEligibleIds.length === 1 ? '' : 's'} to{' '}
                <strong>{LOCATION_STATUS_LABELS[bulkTargetStatus] ?? bulkTargetStatus}</strong>.
              </p>
              {bulkSkippedSame > 0 && (
                <p className="text-onix-500">
                  {bulkSkippedSame} selected shop{bulkSkippedSame === 1 ? ' is' : 's are'} already at this status and
                  will be skipped.
                </p>
              )}
              <p className="text-onix-600">This cannot be undone. Each shop gets an activity log entry.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-arctic-200 px-5 py-3">
              <button
                type="button"
                disabled={bulkApplying}
                onClick={() => {
                  setBulkConfirmOpen(false)
                  setBulkError(null)
                }}
                className="rounded-lg px-4 py-1.5 text-onix-600 hover:bg-arctic-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkApplying || bulkEligibleIds.length === 0}
                onClick={() => void runBulkStatusUpdate()}
                className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkApplying ? 'Updating…' : 'Yes, update shops'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
