import { activeLocations, locationsTable } from '@/lib/locations-active'
import { supabaseAdmin } from '@/lib/supabase'
import { notFound, redirect } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import { canDeleteContracts } from '@/lib/contract-permissions'
import ShopDetailTabs from './ShopDetailTabs'
import { getSignedContractDocUrl } from '@/lib/contract-documents'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import { getExpertAssistShopProgramView } from '@/lib/expert-assist-enrollments'
import TrackRecentShopVisit from '@/components/TrackRecentShopVisit'

export default async function ShopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; merged_from?: string }>
}) {
  const { id } = await params
  const { tab, merged_from: mergedFrom } = await searchParams
  const session = await getAppSession()

  const { data: shop } = await locationsTable(supabaseAdmin)
    .select(`
      *,
      accounts(id, business_name),
      program_enrollments(*),
      location_program_enrollments(
        *,
        program_enrollment_checklist(*)
      ),
      activity_log(*),
      tech_competency_surveys(*),
      shop_facility_surveys(*),
      location_enrichment(google_rating, google_review_count),
      contract_locations(
        contracts(*)
      )
    `)
    .eq('id', id)
    .single()

  if (!shop) notFound()

  if (shop.deleted_at && shop.merged_into) {
    redirect(`/shops/${shop.merged_into}?merged_from=${id}`)
  }

  let mergedFromBanner: { name: string; mergedAt: string } | null = null
  if (mergedFrom) {
    const { data: mergedSource } = await locationsTable(supabaseAdmin)
      .select('name, deleted_at')
      .eq('id', mergedFrom)
      .maybeSingle()
    if (mergedSource?.name) {
      mergedFromBanner = {
        name: mergedSource.name,
        mergedAt: mergedSource.deleted_at ?? '',
      }
    }
  }

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
    const { data: siblings } = await activeLocations(supabaseAdmin, 'id, name, chain_name, city, state, status')
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

  const expertAssistProgram = await getExpertAssistShopProgramView(supabaseAdmin, id, {
    ownerName: primaryContactDisplayName || null,
  }).catch(() => null)

  const cacheShopId =
    typeof shop.motherduck_shop_id === 'string' && shop.motherduck_shop_id.trim()
      ? shop.motherduck_shop_id.trim()
      : id
  const { data: statusCache } = await supabaseAdmin
    .from('shop_status_cache')
    .select('vinfast_store_code')
    .eq('shop_id', cacheShopId)
    .maybeSingle()
  const adminVinfastStoreCode =
    typeof statusCache?.vinfast_store_code === 'string' && statusCache.vinfast_store_code.trim()
      ? statusCache.vinfast_store_code.trim()
      : null

  return (
    <div className="p-6">
      {mergedFromBanner && (
        <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-onix-800">
          This location was merged from <strong>{mergedFromBanner.name}</strong>
          {mergedFromBanner.mergedAt
            ? ` on ${new Date(mergedFromBanner.mergedAt).toLocaleDateString()}`
            : ''}
          . You are viewing the surviving record.
        </div>
      )}
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
        shop={{ ...shop, admin_vinfast_store_code: adminVinfastStoreCode } as any}
        siblingLocations={siblingLocations}
        defaultTab={tab ?? 'activity'}
        senderName={session?.user?.name ?? session?.user?.email ?? 'RepairWise'}
        primaryContactDisplayName={primaryContactDisplayName}
        primaryContactEmail={primaryContactEmail}
        currentUserEmail={session?.user?.email ?? ''}
        allowContractDelete={canDeleteContracts(session?.user?.email)}
        expertAssistProgram={expertAssistProgram}
      />
    </div>
  )
}
