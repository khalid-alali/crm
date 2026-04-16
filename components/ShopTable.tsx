'use client'

import { useRouter } from 'next/navigation'
import StatusBadge from './StatusBadge'
import ChainBadge from './ChainBadge'
import ProgramBadge from './ProgramBadge'
import LastActivityCell from './LastActivityCell'

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

export default function ShopTable({ shops }: Props) {
  const router = useRouter()

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Shop</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Location</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Programs</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last activity</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {shops.map(shop => (
            <tr
              key={shop.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/shops/${shop.id}`)}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-900">{shop.name}</span>
                  <ChainBadge chain={shop.chain_name} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{shop.owners?.name ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {[shop.city, shop.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={shop.status} />
              </td>
              <td className="px-4 py-2.5">
                <ProgramBadge enrollments={shop.program_enrollments} />
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">{shop.assigned_to ?? '—'}</td>
              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                <LastActivityCell createdAt={shop.created_at} lastActivityAt={shop.last_activity_at} />
              </td>
            </tr>
          ))}
          {shops.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No shops found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
