import { supabaseAdmin } from '@/lib/supabase'
import { attachPrimaryContactsToLocations } from '@/lib/primary-contact'
import { BDR_ASSIGNEES } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import ShopsFilters from './ShopsFilters'
import ShopsPageClient from './ShopsPageClient'

const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive'] as const

/** One row per location for filter tabs / dropdowns (no joins). */
type LocationMetaRow = {
  status: string
  chain_name: string | null
}

function pipelineMetaFromRows(rows: LocationMetaRow[]) {
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]))
  const chainSet = new Set<string>()

  for (const row of rows) {
    if (row.status in counts) counts[row.status]++
    if (row.chain_name) chainSet.add(row.chain_name)
  }

  return {
    counts,
    chains: Array.from(chainSet).sort(),
  }
}

interface SearchParams {
  status?: string
  chain?: string
  state?: string
  assigned_to?: string
  program?: string
  disqualified_reason?: string
}

const PIPELINE_LOCATION_SELECT = `
  id,
  name,
  motherduck_shop_id,
  chain_name,
  city,
  state,
  status,
  disqualified_reason,
  assigned_to,
  created_at,
  updated_at,
  account_id,
  accounts(id, business_name),
  program_enrollments(program, status)
`

type PipelineLocationRow = Record<string, unknown> & { id: string; created_at: string }

type ShopsPipelineResult = {
  shops: unknown[]
  counts: Record<string, number>
  chains: string[]
}

async function finalizeShopsPipeline(
  t0: number,
  shopRows: PipelineLocationRow[] | null | undefined,
  metaRows: LocationMetaRow[] | null | undefined,
): Promise<ShopsPipelineResult> {
  console.log(
    `[shops] locations+meta (parallel): ${Date.now() - t0}ms rows=${shopRows?.length ?? 0}`,
  )

  const t1 = Date.now()
  const withActivity = await attachLastActivity(shopRows ?? [])
  console.log(`[shops] attachLastActivity: ${Date.now() - t1}ms`)

  const t2 = Date.now()
  const shops = await attachPrimaryContactsToLocations(
    supabaseAdmin,
    withActivity as unknown as { id: string; account_id: string | null }[],
  )
  console.log(`[shops] attachPrimaryContacts: ${Date.now() - t2}ms`)

  const meta = pipelineMetaFromRows((metaRows ?? []) as LocationMetaRow[])
  console.log(`[shops] total server: ${Date.now() - t0}ms`)

  return { shops, counts: meta.counts, chains: meta.chains }
}

async function attachLastActivity(rows: PipelineLocationRow[]) {
  if (rows.length === 0) return rows

  const { data, error } = await supabaseAdmin.rpc('pipeline_last_activity', {
    p_location_ids: rows.map(r => r.id),
  })

  if (error) {
    console.error('pipeline_last_activity RPC failed:', error.message)
    return rows.map(r => ({ ...r, last_activity_at: null as string | null }))
  }

  const lastById = new Map<string, string>()
  for (const row of data ?? []) {
    const r = row as { location_id: string; last_at: string }
    lastById.set(r.location_id, r.last_at)
  }

  return rows.map(r => ({
    ...r,
    last_activity_at: lastById.get(r.id) ?? null,
  }))
}

export const dynamic = 'force-dynamic'

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const hasListFilters = Boolean(
    sp.status ||
      sp.chain ||
      sp.state ||
      sp.assigned_to ||
      sp.disqualified_reason,
  )

  const metaQuery = supabaseAdmin.from('locations').select('status, chain_name')

  let shops: unknown[] = []
  let counts: Record<string, number>
  let chains: string[]

  if (hasListFilters) {
    let listQuery = supabaseAdmin
      .from('locations')
      .select(PIPELINE_LOCATION_SELECT)
      .order('updated_at', { ascending: false })
    if (sp.status) {
      listQuery = listQuery.eq('status', sp.status)
      if (sp.status === 'inactive' && sp.disqualified_reason) {
        listQuery = listQuery.eq('disqualified_reason', sp.disqualified_reason)
      }
    } else if (sp.disqualified_reason) {
      listQuery = listQuery.eq('status', 'inactive').eq('disqualified_reason', sp.disqualified_reason)
    } else {
      // "All" view should hide churned (inactive) by default.
      listQuery = listQuery.neq('status', 'inactive')
    }
    if (sp.chain) listQuery = listQuery.eq('chain_name', sp.chain)
    if (sp.state) listQuery = listQuery.eq('state', sp.state)
    if (sp.assigned_to) listQuery = listQuery.eq('assigned_to', sp.assigned_to)

    const t0 = Date.now()
    const [{ data: shopRows }, { data: metaRows }] = await Promise.all([listQuery, metaQuery])
    const pipeline = await finalizeShopsPipeline(t0, shopRows ?? [], metaRows ?? [])
    shops = pipeline.shops
    counts = pipeline.counts
    chains = pipeline.chains
  } else {
    const t0 = Date.now()
    const [{ data: shopRows }, { data: metaRows }] = await Promise.all([
      supabaseAdmin
        .from('locations')
        .select(PIPELINE_LOCATION_SELECT)
        // "All" view should hide churned (inactive) by default.
        .neq('status', 'inactive')
        .order('updated_at', { ascending: false }),
      metaQuery,
    ])
    const pipeline = await finalizeShopsPipeline(t0, shopRows ?? [], metaRows ?? [])
    shops = pipeline.shops
    counts = pipeline.counts
    chains = pipeline.chains
  }

  return (
    <div className="p-6">
      <ShopsPageClient title="Pipeline" shops={shops as any} pipelineStatusFilter={sp.status}>
        <ShopsFilters
          statuses={[...STATUSES]}
          statusLabels={LOCATION_STATUS_LABELS}
          statusCounts={counts}
          chains={chains}
          assignees={[...BDR_ASSIGNEES]}
          searchParams={sp}
        />
      </ShopsPageClient>
    </div>
  )
}
