import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import ProgramBadge from '@/components/ProgramBadge'
import OwnerDetailEditor from './OwnerDetailEditor'

export default async function OwnerDetailPage({ params }: { params: { id: string } }) {
  const { data: owner } = await supabaseAdmin
    .from('owners')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!owner) notFound()

  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name, chain_name, city, state, status, program_enrollments(program, status)')
    .eq('owner_id', params.id)
    .order('name')

  const { data: contracts } = await supabaseAdmin
    .from('contracts')
    .select('id, counterparty_company, counterparty_name, legal_entity_name, status, signing_date')
    .eq('owner_id', params.id)
    .order('created_at', { ascending: false })

  // Aggregate program enrollments
  const programCounts: Record<string, number> = {}
  for (const loc of locations ?? []) {
    for (const e of loc.program_enrollments ?? []) {
      if (e.status === 'active') {
        programCounts[e.program] = (programCounts[e.program] ?? 0) + 1
      }
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1 text-sm text-gray-500">
        <Link href="/owners" className="hover:underline">Owners</Link>
        <span>/</span>
        <span>{owner.name}</span>
      </div>

      <h1 className="text-xl font-semibold mb-5">{owner.name}</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <OwnerDetailEditor owner={owner} />
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-3">Program Enrollment Summary</h2>
          {Object.keys(programCounts).length === 0 ? (
            <p className="text-sm text-gray-400">No active programs across locations.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(programCounts).map(([p, cnt]) => (
                <div key={p} className="flex justify-between text-sm">
                  <span className="text-gray-600">{p.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{cnt} location{cnt !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Locations */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">Locations ({locations?.length ?? 0})</h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Programs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(locations ?? []).map(loc => (
                <tr key={loc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/shops/${loc.id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      {loc.name}
                      <ChainBadge chain={loc.chain_name} />
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={loc.status} /></td>
                  <td className="px-4 py-2.5">
                    <ProgramBadge enrollments={loc.program_enrollments ?? []} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contracts */}
      <section>
        <h2 className="text-sm font-semibold text-gray-600 mb-3">Contracts ({contracts?.length ?? 0})</h2>
        <div className="space-y-2">
          {(contracts ?? []).map(contract => (
            <div key={contract.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{contract.counterparty_company || contract.counterparty_name || 'Contract'}</span>
                {contract.legal_entity_name && (
                  <span className="ml-2 text-xs text-gray-400">Signed as: {contract.legal_entity_name}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {contract.signing_date && (
                  <span className="text-xs text-gray-400">
                    {new Date(contract.signing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                <StatusBadge status={contract.status} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
