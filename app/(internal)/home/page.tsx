import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import HomeDashboardClient from '@/components/home/HomeDashboardClient'

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
  accounts: { business_name: string } | { business_name: string }[] | null
  contract_locations: ContractLocation[] | null
}

function firstLocation(contract: ContractRow) {
  const locations = (contract.contract_locations ?? [])
    .flatMap(row => row?.locations ?? [])
  return locations[0] ?? null
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getAppSession()
  const [{ data: awaitingData }, { data: signedData }] = await Promise.all([
    supabaseAdmin
      .from('contracts')
      .select(
        'id, status, created_at, signing_date, standard_labor_rate, warranty_labor_rate, accounts(business_name), contract_locations(location_id, locations(id, name, city, state))',
      )
      .in('status', ['sent', 'viewed'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('contracts')
      .select(
        'id, status, created_at, signing_date, standard_labor_rate, warranty_labor_rate, accounts(business_name), contract_locations(location_id, locations(id, name, city, state))',
      )
      .eq('status', 'signed')
      .order('signing_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const awaiting = (awaitingData ?? []) as ContractRow[]
  const recentlySigned = (signedData ?? []) as ContractRow[]
  const awaitingSignatureCards = awaiting.map(contract => {
    const location = firstLocation(contract)
    const acc = contract.accounts
    const accountLabel =
      (Array.isArray(acc) ? acc[0]?.business_name : acc?.business_name) ?? 'Unknown account'
    const sentLabel = contract.status === 'viewed' ? 'Viewed' : 'Sent'
    return {
      id: contract.id,
      locationId: location?.id ?? null,
      shopName: location?.name ?? 'Contract without linked shop',
      subtitle: `${accountLabel} · ${sentLabel}`,
    }
  })
  const recentlySignedCards = recentlySigned.map(contract => {
    const location = firstLocation(contract)
    const cityState = [location?.city, location?.state].filter(Boolean).join(', ')
    return {
      id: contract.id,
      locationId: location?.id ?? null,
      shopName: location?.name ?? 'Signed contract without linked shop',
      subtitle: cityState || 'Needs onboarding follow-up',
    }
  })

  return (
    <HomeDashboardClient
      currentUserEmail={session?.user?.email ?? ''}
      awaitingSignature={awaitingSignatureCards}
      recentlySigned={recentlySignedCards}
    />
  )
}
