'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import StatusBadge from './StatusBadge'
import ProgramBadge from './ProgramBadge'
import LastActivityCell from './LastActivityCell'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { DISQUALIFIED_REASON_LABELS, type DisqualifiedReason } from '@/lib/location-outcome-reasons'

export interface ShopRow {
  id: string
  name: string
  motherduck_shop_id: string | null
  chain_name: string | null
  city: string | null
  state: string | null
  status: string
  disqualified_reason?: string | null
  assigned_to: string | null
  created_at: string
  last_activity_at: string | null
  accounts: { id: string; business_name: string } | null
  primary_owner_name: string | null
  primary_owner_email: string | null
  program_enrollments: { program: string; status: string }[]
}

interface Props {
  shops: ShopRow[]
  /** When viewing Churned pipeline rows, show disqualified reason column. */
  showDisqualifiedReasonColumn?: boolean
  /** When set, first column is row checkboxes + header “select all visible”. */
  selection?: {
    selectedIds: Set<string>
    onToggleRow: (id: string) => void
    onToggleAllVisible: () => void
    allVisibleSelected: boolean
    someVisibleSelected: boolean
  }
}

type SortColumn = 'shop' | 'primaryOwner' | 'location' | 'status' | 'disqualified' | 'programs' | 'lastActivity'
type SortDirection = 'asc' | 'desc'

const BASE_SORTABLE_HEADERS: { key: SortColumn; label: string }[] = [
  { key: 'shop', label: 'Shop' },
  { key: 'primaryOwner', label: 'Owner' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
  { key: 'disqualified', label: 'Disqualified reason' },
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

function disqualifiedSortLabel(reason: string | null | undefined) {
  if (!reason) return ''
  const key = reason as DisqualifiedReason
  return DISQUALIFIED_REASON_LABELS[key] ?? reason
}

export default function ShopTable({ shops, selection, showDisqualifiedReasonColumn = false }: Props) {
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const sortableHeaders = useMemo(() => {
    if (showDisqualifiedReasonColumn) return BASE_SORTABLE_HEADERS
    return BASE_SORTABLE_HEADERS.filter(h => h.key !== 'disqualified')
  }, [showDisqualifiedReasonColumn])

  useEffect(() => {
    const el = headerCheckboxRef.current
    if (!el) return
    el.indeterminate = Boolean(selection?.someVisibleSelected && !selection?.allVisibleSelected)
  }, [selection?.allVisibleSelected, selection?.someVisibleSelected])

  useEffect(() => {
    if (!showDisqualifiedReasonColumn && sortColumn === 'disqualified') {
      setSortColumn(null)
    }
  }, [showDisqualifiedReasonColumn, sortColumn])

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
        case 'primaryOwner':
          compare = sortText(aShop.primary_owner_name).localeCompare(sortText(bShop.primary_owner_name))
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
        case 'disqualified':
          compare = sortText(disqualifiedSortLabel(aShop.disqualified_reason)).localeCompare(
            sortText(disqualifiedSortLabel(bShop.disqualified_reason)),
          )
          break
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

  const rowVirtualizer = useVirtualizer({
    count: sortedShops.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 45,
    overscan: 8,
  })

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
  }, [rowVirtualizer, shops, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (!showDisqualifiedReasonColumn && column === 'disqualified') return
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  return (
    <div ref={scrollRef} className="max-h-[calc(100vh-240px)] overflow-auto">
      <table className="min-w-full table-fixed divide-y divide-arctic-200 text-sm">
        <thead className="sticky top-0 z-10 block bg-arctic-50">
          <tr className="table w-full table-fixed">
            {selection && (
              <th
                scope="col"
                className="w-10 border-b border-arctic-200 bg-arctic-50 px-2 py-2 text-left shadow-[0_1px_0_0_rgb(229_231_235)]"
              >
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-arctic-300 text-brand-600 focus:ring-brand-500"
                  checked={selection.allVisibleSelected && shops.length > 0}
                  onChange={() => selection.onToggleAllVisible()}
                  aria-label="Select all shops in this list"
                />
              </th>
            )}
            {sortableHeaders.map(header => (
              <th
                key={header.key}
                scope="col"
                className="cursor-pointer select-none border-b border-arctic-200 bg-arctic-50 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-onix-600 shadow-[0_1px_0_0_rgb(229_231_235)] transition-colors hover:text-onix-900"
                onClick={() => toggleSort(header.key)}
                aria-sort={
                  sortColumn === header.key
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {header.label}
              </th>
            ))}
            <th
              scope="col"
              className="border-b border-arctic-200 bg-arctic-50 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-onix-600 shadow-[0_1px_0_0_rgb(229_231_235)]"
            >
              Admin
            </th>
          </tr>
        </thead>
        <tbody
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
            display: 'block',
          }}
          className="bg-white"
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const shop = sortedShops[virtualRow.index]
            return (
              <tr
                key={shop.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="cursor-pointer border-b border-arctic-100 hover:bg-arctic-50"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'table',
                  tableLayout: 'fixed',
                }}
                onClick={() => router.push(`/shops/${shop.id}`)}
              >
                {selection && (
                  <td
                    className="w-10 px-2 py-2.5"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-arctic-300 text-brand-600 focus:ring-brand-500"
                      checked={selection.selectedIds.has(shop.id)}
                      onChange={() => selection.onToggleRow(shop.id)}
                      aria-label={`Select ${shop.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <Link
                    href={`/shops/${shop.id}`}
                    className="font-medium text-onix-950 hover:text-brand-700 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {shop.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-onix-600">{shop.primary_owner_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-onix-600">
                  {[shop.city, shop.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={shop.status} />
                </td>
                {showDisqualifiedReasonColumn && (
                  <td className="px-4 py-2.5 text-onix-600">
                    {disqualifiedSortLabel(shop.disqualified_reason) || '—'}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <ProgramBadge enrollments={shop.program_enrollments} />
                </td>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  <LastActivityCell createdAt={shop.created_at} lastActivityAt={shop.last_activity_at} />
                </td>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  {shop.motherduck_shop_id ? (
                    <a
                      href={`https://app.repairwise.pro/admin/shops/${encodeURIComponent(shop.motherduck_shop_id)}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap text-brand-600 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-onix-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
          {sortedShops.length === 0 && (
            <tr className="table w-full table-fixed">
              <td
                colSpan={selection ? (showDisqualifiedReasonColumn ? 9 : 8) : showDisqualifiedReasonColumn ? 8 : 7}
                className="px-4 py-8 text-center text-onix-400"
              >
                No shops found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
