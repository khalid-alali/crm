import Link from 'next/link'
import { Clock3 } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase'

type ContractLocation = {
  location_id: string
  locations: {
    id: string
    name: string
    city: string | null
    state: string | null
  }[] | null
} | null

type ContractRow = {
  id: string
  status: string
  created_at: string
  signing_date: string | null
  standard_labor_rate: number | null
  warranty_labor_rate: number | null
  owners: { name: string }[] | null
  contract_locations: ContractLocation[] | null
}

function firstLocation(contract: ContractRow) {
  const locations = (contract.contract_locations ?? [])
    .flatMap(row => row?.locations ?? [])
  return locations[0] ?? null
}

function money(rate: number | null) {
  if (rate == null) return null
  return `$${rate}/hr`
}

function formatRates(contract: ContractRow) {
  const standard = money(contract.standard_labor_rate)
  const warranty = money(contract.warranty_labor_rate)
  if (!standard && !warranty) return null
  if (standard && warranty) return `${standard} · Warranty: ${warranty}`
  return standard ?? `Warranty: ${warranty}`
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [{ data: awaitingData }, { data: signedData }] = await Promise.all([
    supabaseAdmin
      .from('contracts')
      .select(
        'id, status, created_at, signing_date, standard_labor_rate, warranty_labor_rate, owners(name), contract_locations(location_id, locations(id, name, city, state))',
      )
      .in('status', ['sent', 'viewed'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('contracts')
      .select(
        'id, status, created_at, signing_date, standard_labor_rate, warranty_labor_rate, owners(name), contract_locations(location_id, locations(id, name, city, state))',
      )
      .eq('status', 'signed')
      .order('signing_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const awaiting = (awaitingData ?? []) as ContractRow[]
  const recentlySigned = (signedData ?? []) as ContractRow[]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-onix-950">Home</h1>
          <p className="mt-1 text-sm text-onix-500">Contracts and onboarding at a glance</p>
        </div>
        <Link
          href="/shops"
          className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          View Pipeline
        </Link>
      </div>

      <section className="rounded-2xl border border-arctic-200 bg-white">
        <div className="flex items-center justify-between border-b border-arctic-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-onix-900">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Contracts Awaiting Signature
            </div>
            <p className="mt-1 text-sm text-onix-500">Sent but not yet signed</p>
          </div>
          <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
            {awaiting.length}
          </span>
        </div>

        <div>
          {awaiting.length === 0 ? (
            <p className="px-5 py-4 text-sm text-onix-500">No contracts are currently waiting for signature.</p>
          ) : (
            awaiting.map(contract => {
              const location = firstLocation(contract)
              const owner = contract.owners?.[0]?.name ?? 'Unknown owner'
              const rates = formatRates(contract)
              const statusLabel = contract.status === 'viewed' ? 'Viewed' : 'Sent'

              const content = (
                <div className="flex items-center justify-between gap-3 border-b border-arctic-100 px-5 py-4 last:border-b-0 hover:bg-arctic-50">
                  <div>
                    <p className="text-base font-semibold text-onix-900">
                      {location?.name ?? 'Contract without linked shop'}
                    </p>
                    <p className="text-sm text-onix-500">{[owner, rates].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    {statusLabel}
                  </span>
                </div>
              )

              if (!location?.id) {
                return <div key={contract.id}>{content}</div>
              }

              return (
                <Link key={contract.id} href={`/shops/${location.id}`} className="block">
                  {content}
                </Link>
              )
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-arctic-200 bg-white">
        <div className="border-b border-arctic-200 px-5 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-onix-900">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Recently Signed
          </div>
          <p className="mt-1 text-sm text-onix-500">Needs onboarding follow-up</p>
        </div>

        <div>
          {recentlySigned.length === 0 ? (
            <p className="px-5 py-4 text-sm text-onix-500">No recently signed contracts yet.</p>
          ) : (
            recentlySigned.map(contract => {
              const location = firstLocation(contract)
              const owner = contract.owners?.[0]?.name ?? 'Unknown owner'
              const cityState = [location?.city, location?.state].filter(Boolean).join(', ')

              const content = (
                <div className="flex items-center justify-between gap-3 border-b border-arctic-100 px-5 py-4 last:border-b-0 hover:bg-arctic-50">
                  <div>
                    <p className="text-base font-semibold text-onix-900">
                      {location?.name ?? 'Signed contract without linked shop'}
                    </p>
                    <p className="text-sm text-onix-500">{[owner, cityState].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Signed
                  </span>
                </div>
              )

              if (!location?.id) {
                return <div key={contract.id}>{content}</div>
              }

              return (
                <Link key={contract.id} href={`/shops/${location.id}`} className="block">
                  {content}
                </Link>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
