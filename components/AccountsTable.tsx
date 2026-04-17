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

type SortKey = 'business_name' | 'primary_owner_email' | 'location_count' | 'primary_owner_phone'
type SortDir = 'asc' | 'desc'

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function phoneSortKey(phone: string | null): string {
  if (!phone?.trim()) return ''
  return phone.replace(/\D/g, '')
}

function sortedRows(rows: AccountListRow[], key: SortKey, dir: SortDir): AccountListRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    let c = 0
    switch (key) {
      case 'business_name':
        c = compareText(x.business_name, y.business_name)
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

function SortLabel({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-onix-300 font-normal">↕</span>
  return <span className="text-onix-800 font-normal">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function AccountsTable({ accounts }: { accounts: AccountListRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('business_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows = useMemo(() => sortedRows(accounts, sortKey, sortDir), [accounts, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function header(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th className="px-4 py-2 text-left text-xs font-medium text-onix-600 uppercase tracking-wide">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1.5 hover:text-onix-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {label}
          <SortLabel active={active} dir={sortDir} />
        </button>
      </th>
    )
  }

  return (
    <div className="bg-white border border-arctic-200 rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-arctic-200 text-sm">
        <thead className="bg-arctic-50">
          <tr>
            {header('business_name', 'Account')}
            <th className="px-4 py-2 text-left text-xs font-medium text-onix-600 uppercase tracking-wide">Owner</th>
            {header('primary_owner_email', 'Email')}
            {header('location_count', 'Locations')}
            {header('primary_owner_phone', 'Phone')}
          </tr>
        </thead>
        <tbody className="divide-y divide-arctic-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-onix-400">
                No accounts found.
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
  )
}
