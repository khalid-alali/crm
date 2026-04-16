'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from './StatusBadge'
import ChainBadge from './ChainBadge'
import ProgramBadge from './ProgramBadge'
import LastActivityCell from './LastActivityCell'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

export interface ShopRow {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
  status: string
  assigned_to: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  created_at: string
  last_activity_at: string | null
  owners: { name: string } | null
  program_enrollments: { program: string; status: string }[]
}

interface Props {
  shops: ShopRow[]
}

type SortColumn = 'shop' | 'owner' | 'location' | 'status' | 'programs' | 'lastActivity'
type SortDirection = 'asc' | 'desc'

const SORTABLE_HEADERS: { key: SortColumn; label: string }[] = [
  { key: 'shop', label: 'Shop' },
  { key: 'owner', label: 'Owner' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
  { key: 'programs', label: 'Programs' },
  { key: 'lastActivity', label: 'Last activity' },
]

function sortText(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

function sortPrograms(enrollments: ShopRow['program_enrollments']) {
  const activePrograms = enrollments
    .filter(e => e.status !== 'not_enrolled')
    .map(e => e.program)
    .sort()
  return `${activePrograms.length.toString().padStart(2, '0')}:${activePrograms.join(',')}`
}

export default function ShopTable({ shops }: Props) {
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedShops = useMemo(() => {
    if (!sortColumn) return shops

    const decorated = shops.map((shop, index) => ({ shop, index }))
    decorated.sort((a, b) => {
      const aShop = a.shop
      const bShop = b.shop
      let compare = 0

      switch (sortColumn) {
        case 'shop':
          compare = sortText(aShop.name).localeCompare(sortText(bShop.name))
          break
        case 'owner':
          compare = sortText(aShop.owners?.name).localeCompare(sortText(bShop.owners?.name))
          break
        case 'location': {
          const aLocation = [aShop.city, aShop.state].filter(Boolean).join(', ')
          const bLocation = [bShop.city, bShop.state].filter(Boolean).join(', ')
          compare = sortText(aLocation).localeCompare(sortText(bLocation))
          break
        }
        case 'status': {
          const aStatus = LOCATION_STATUS_LABELS[aShop.status] ?? aShop.status
          const bStatus = LOCATION_STATUS_LABELS[bShop.status] ?? bShop.status
          compare = sortText(aStatus).localeCompare(sortText(bStatus))
          break
        }
        case 'programs':
          compare = sortPrograms(aShop.program_enrollments).localeCompare(
            sortPrograms(bShop.program_enrollments),
          )
          break
        case 'lastActivity': {
          const aDate = Date.parse(aShop.last_activity_at ?? aShop.created_at)
          const bDate = Date.parse(bShop.last_activity_at ?? bShop.created_at)
          compare = aDate - bDate
          break
        }
        default:
          compare = 0
      }

      if (compare === 0) return a.index - b.index
      return sortDirection === 'asc' ? compare : -compare
    })

    return decorated.map(row => row.shop)
  }, [shops, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  function sortIndicator(column: SortColumn) {
    if (sortColumn !== column) return '↕'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-arctic-200 text-sm">
        <thead className="bg-arctic-50">
          <tr>
            {SORTABLE_HEADERS.map(header => (
              <th
                key={header.key}
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium text-onix-600 uppercase tracking-wide"
              >
                <button
                  type="button"
                  onClick={() => toggleSort(header.key)}
                  className="inline-flex items-center gap-1 hover:text-onix-900 transition-colors"
                  aria-label={`Sort by ${header.label}`}
                >
                  <span>{header.label}</span>
                  <span aria-hidden className="text-[10px] leading-none text-onix-400">
                    {sortIndicator(header.key)}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-arctic-100">
          {sortedShops.map(shop => (
            <tr
              key={shop.id}
              className="hover:bg-arctic-50 cursor-pointer"
              onClick={() => router.push(`/shops/${shop.id}`)}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-onix-950">{shop.name}</span>
                  <ChainBadge chain={shop.chain_name} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-onix-600">{shop.owners?.name ?? '—'}</td>
              <td className="px-4 py-2.5 text-onix-600">
                {[shop.city, shop.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={shop.status} />
              </td>
              <td className="px-4 py-2.5">
                <ProgramBadge enrollments={shop.program_enrollments} />
              </td>
              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                <LastActivityCell createdAt={shop.created_at} lastActivityAt={shop.last_activity_at} />
              </td>
            </tr>
          ))}
          {sortedShops.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-onix-400">No shops found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
