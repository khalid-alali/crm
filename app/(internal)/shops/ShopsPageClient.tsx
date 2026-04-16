'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
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
    shop.owners?.name,
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
  const filtered = useMemo(
    () => shops.filter(s => shopMatchesQuery(s, query)),
    [shops, query],
  )

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-4">
        <div className="flex flex-col gap-3 min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-lg font-semibold shrink-0">{title}</h1>
          <div className="min-w-0 flex-1 max-w-xl">
            <label htmlFor="pipeline-shop-search" className="sr-only">
              Search shops
            </label>
            <input
              id="pipeline-shop-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search name, city, owner, or chain…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full border border-arctic-300 rounded-lg px-3 py-2 text-sm text-onix-950 placeholder:text-onix-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>
        <Link
          href="/shops/new"
          className="shrink-0 px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 text-center sm:text-left"
        >
          + Add Shop
        </Link>
      </div>

      {children}

      <div className="bg-white border border-arctic-200 rounded-lg overflow-hidden">
        <ShopTable shops={filtered} />
      </div>
    </>
  )
}
