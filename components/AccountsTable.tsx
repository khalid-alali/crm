'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatPhoneDisplay, phoneTelHref } from '@/lib/phone'

export type AccountListRow = {
  id: string
  business_name: string
  primary_owner_name: string | null
  primary_owner_email: string | null
  primary_owner_phone: string | null
  location_count: number
}

type SortKey =
  | 'business_name'
  | 'primary_owner_name'
  | 'primary_owner_email'
  | 'location_count'
  | 'primary_owner_phone'
type SortDir = 'asc' | 'desc'

const SORTABLE_HEADERS: { key: SortKey; label: string }[] = [
  { key: 'business_name', label: 'Account' },
  { key: 'primary_owner_name', label: 'Owner' },
  { key: 'primary_owner_email', label: 'Email' },
  { key: 'location_count', label: 'Locations' },
  { key: 'primary_owner_phone', label: 'Phone' },
]

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function phoneSortKey(phone: string | null): string {
  if (!phone?.trim()) return ''
  return phone.replace(/\D/g, '')
}

function accountMatchesQuery(row: AccountListRow, raw: string): boolean {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return true

  const fieldTexts = [row.business_name, row.primary_owner_name, row.primary_owner_email]
    .map(f => (f ?? '').toLowerCase())

  return tokens.every(token => fieldTexts.some(text => text.includes(token)))
}

function sortedRows(rows: AccountListRow[], key: SortKey, dir: SortDir): AccountListRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    let c = 0
    switch (key) {
      case 'business_name':
        c = compareText(x.business_name, y.business_name)
        break
      case 'primary_owner_name':
        c = compareText(x.primary_owner_name ?? '', y.primary_owner_name ?? '')
        break
      case 'primary_owner_email':
        c = compareText(x.primary_owner_email ?? '', y.primary_owner_email ?? '')
        break
      case 'location_count':
        c = x.location_count - y.location_count
        break
      case 'primary_owner_phone':
        c = compareText(phoneSortKey(x.primary_owner_phone), phoneSortKey(y.primary_owner_phone))
        break
    }
    if (c !== 0) return c * mul
    return compareText(x.business_name, y.business_name)
  })
}

export default function AccountsTable({ accounts }: { accounts: AccountListRow[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('business_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filtered = useMemo(
    () => accounts.filter(a => accountMatchesQuery(a, query)),
    [accounts, query],
  )

  const rows = useMemo(() => sortedRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const emptyMessage =
    accounts.length === 0
      ? 'No accounts found.'
      : 'No accounts match your search.'

  return (
    <div className="space-y-3">
      <div className="min-w-[280px] max-w-md">
        <label htmlFor="accounts-search" className="sr-only">
          Search accounts
        </label>
        <input
          id="accounts-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search account, owner, or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-xl border border-arctic-300 bg-white px-4 py-2.5 text-sm text-onix-950 placeholder:text-onix-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="bg-white border border-arctic-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-arctic-200 text-sm">
          <thead className="bg-arctic-50">
            <tr>
              {SORTABLE_HEADERS.map(header => (
                <th
                  key={header.key}
                  scope="col"
                  className="cursor-pointer select-none px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-onix-600 transition-colors hover:text-onix-900"
                  onClick={() => toggleSort(header.key)}
                  aria-sort={
                    sortKey === header.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-arctic-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-onix-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const display = formatPhoneDisplay(row.primary_owner_phone)
              const tel = phoneTelHref(row.primary_owner_phone)
              return (
                <tr key={row.id} className="hover:bg-arctic-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/accounts/${row.id}`} className="font-medium text-brand-600 hover:underline">
                      {row.business_name?.trim() ? row.business_name : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-onix-600">{row.primary_owner_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-onix-600">{row.primary_owner_email?.trim() ? row.primary_owner_email : '—'}</td>
                  <td className="px-4 py-2.5 text-onix-600 tabular-nums">{row.location_count}</td>
                  <td className="px-4 py-2.5 text-onix-600">
                    {display && tel ? (
                      <a href={tel} className="text-brand-600 hover:underline tabular-nums">
                        {display}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
