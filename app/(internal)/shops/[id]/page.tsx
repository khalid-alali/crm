import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import { canDeleteContracts } from '@/lib/contract-permissions'
import ShopDetailTabs from './ShopDetailTabs'
import { getSignedContractDocUrl } from '@/lib/contract-documents'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import TrackRecentShopVisit from '@/components/TrackRecentShopVisit'

export default async function ShopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const session = await getAppSession()

  const { data: shop } = await supabaseAdmin
    .from('locations')
    .select(`
      *,
      accounts(*),
      program_enrollments(*),
      activity_log(*),
      tech_competency_surveys(*),
      location_enrichment(google_rating, google_review_count),
      contract_locations(
        contracts(*)
      )
    `)
    .eq('id', id)
    .single()

  if (!shop) notFound()

  if (shop.contract_locations?.length) {
    await Promise.all(
      shop.contract_locations.map(async (cl: any) => {
        if (!cl?.contracts) return
        cl.contracts.doc_url = await getSignedContractDocUrl(cl.contracts)
      }),
    )
  }

  let siblingLocations: {
    id: string
    name: string
    chain_name: string | null
    city: string | null
    state: string | null
    status: string
  }[] = []

  if (shop.account_id) {
    const { data: siblings } = await supabaseAdmin
      .from('locations')
      .select('id, name, chain_name, city, state, status')
      .eq('account_id', shop.account_id)
      .order('name')
    siblingLocations = siblings ?? []
  } else {
    siblingLocations = [
      {
        id: shop.id,
        name: shop.name,
        chain_name: shop.chain_name,
        city: shop.city,
        state: shop.state,
        status: shop.status,
      },
    ]
  }

  const primary = await resolvePrimaryContact(supabaseAdmin, shop.account_id as string | null | undefined, id)
  const primaryContactDisplayName = primary?.name?.trim() || primary?.email?.trim() || ''
  const primaryContactEmail = primary?.email?.trim() || ''

  return (
    <div className="p-6">
      <TrackRecentShopVisit
        shop={{
          id: shop.id,
          name: shop.name,
          status: shop.status,
          city: shop.city,
          state: shop.state,
        }}
      />
      <ShopDetailTabs
        shop={shop as any}
        siblingLocations={siblingLocations}
        defaultTab={tab ?? 'activity'}
        senderName={session?.user?.name ?? session?.user?.email ?? 'RepairWise'}
        primaryContactDisplayName={primaryContactDisplayName}
        primaryContactEmail={primaryContactEmail}
        allowContractDelete={canDeleteContracts(session?.user?.email)}
      />
    </div>
  )
}
