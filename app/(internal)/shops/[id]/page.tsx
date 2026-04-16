import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import ShopDetailTabs from './ShopDetailTabs'
import { getSignedContractDocUrl } from '@/lib/contract-documents'

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
      owners(*),
      program_enrollments(*),
      activity_log(*),
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
      })
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

  if (shop.owner_id) {
    const { data: siblings } = await supabaseAdmin
      .from('locations')
      .select('id, name, chain_name, city, state, status')
      .eq('owner_id', shop.owner_id)
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

  return (
    <div className="p-6">
      <ShopDetailTabs
        shop={shop as any}
        siblingLocations={siblingLocations}
        defaultTab={tab ?? 'activity'}
        senderName={session?.user?.name ?? session?.user?.email ?? 'RepairWise'}
      />
    </div>
  )
}
