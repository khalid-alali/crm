'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatPhoneDisplay, phoneTelHref } from '@/lib/phone'

export type OwnerListRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  location_count: number
}

type SortKey = 'name' | 'email' | 'location_count' | 'phone'
type SortDir = 'asc' | 'desc'

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function phoneSortKey(phone: string | null): string {
  if (!phone?.trim()) return ''
  return phone.replace(/\D/g, '')
}

function sortedRows(rows: OwnerListRow[], key: SortKey, dir: SortDir): OwnerListRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    let c = 0
    switch (key) {
      case 'name':
        c = compareText(x.name, y.name)
        break
      case 'email':
        c = compareText(x.email ?? '', y.email ?? '')
        break
      case 'location_count':
        c = x.location_count - y.location_count
        break
      case 'phone':
        c = compareText(phoneSortKey(x.phone), phoneSortKey(y.phone))
        break
    }
    if (c !== 0) return c * mul
    return compareText(x.name, y.name)
  })
}

function SortLabel({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-onix-300 font-normal">↕</span>
  return <span className="text-onix-800 font-normal">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function OwnersTable({ owners }: { owners: OwnerListRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows = useMemo(() => sortedRows(owners, sortKey, sortDir), [owners, sortKey, sortDir])

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
            {header('name', 'Name')}
            {header('email', 'Email')}
            {header('location_count', 'Locations')}
            {header('phone', 'Phone')}
          </tr>
        </thead>
        <tbody className="divide-y divide-arctic-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-onix-400">
                No owners found.
              </td>
            </tr>
          ) : (
            rows.map(owner => {
              const display = formatPhoneDisplay(owner.phone)
              const tel = phoneTelHref(owner.phone)
              return (
                <tr key={owner.id} className="hover:bg-arctic-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/owners/${owner.id}`} className="font-medium text-brand-600 hover:underline">
                      {owner.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-onix-600">{owner.email?.trim() ? owner.email : '—'}</td>
                  <td className="px-4 py-2.5 text-onix-600 tabular-nums">{owner.location_count}</td>
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
