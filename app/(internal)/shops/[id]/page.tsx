import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import ShopDetailTabs from './ShopDetailTabs'
import DeleteShopButton from '@/components/DeleteShopButton'
import { getSignedContractDocUrl } from '@/lib/contract-documents'

export default async function ShopDetailPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
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
    .eq('id', params.id)
    .single()

  if (!shop) notFound()

  const adminShopUrl = shop.motherduck_shop_id
    ? `https://app.repairwise.pro/admin/shops/${encodeURIComponent(shop.motherduck_shop_id)}`
    : null

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
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1 text-sm text-onix-600">
        <Link href="/shops" className="hover:underline">Shops</Link>
        <span>/</span>
        <span>{shop.name}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold">{shop.name}</h1>
        <ChainBadge chain={shop.chain_name} />
        <StatusBadge status={shop.status} />
        <div className="ml-auto flex items-center gap-4 text-sm">
          {adminShopUrl ? (
            <a
              href={adminShopUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded bg-onix-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-onix-950"
            >
              Admin
            </a>
          ) : (
            <span className="text-onix-400">Admin unavailable</span>
          )}
        </div>
      </div>

      <div className="mb-3 border-b border-arctic-200" />
      <div className="mb-4 flex items-center justify-end gap-4 text-sm">
        <Link href={`/shops/${shop.id}/edit`} className="text-onix-600 hover:underline">
          Edit
        </Link>
        <DeleteShopButton shopId={shop.id} shopName={shop.name} />
      </div>

      <ShopDetailTabs
        shop={shop as any}
        siblingLocations={siblingLocations}
        defaultTab={searchParams.tab ?? 'details'}
        senderName={session?.user?.name ?? session?.user?.email ?? 'RepairWise'}
      />
    </div>
  )
}
