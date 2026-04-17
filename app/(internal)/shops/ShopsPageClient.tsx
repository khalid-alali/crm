'use client'

import Link from 'next/link'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import ShopTable, { type ShopRow } from '@/components/ShopTable'

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
  const [query, setQuery] = useState('')
  const stickyToolbarRef = useRef<HTMLDivElement>(null)
  const [stickyToolbarPx, setStickyToolbarPx] = useState(0)

  const filtered = useMemo(
    () => shops.filter(s => shopMatchesQuery(s, query)),
    [shops, query],
  )

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

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="min-w-[280px] flex-1 max-w-md">
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
      </div>

      <div className="bg-white border border-arctic-200 rounded-lg">
        <ShopTable shops={filtered} />
      </div>
    </div>
  )
}
