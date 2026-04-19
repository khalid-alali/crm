import { supabaseAdmin } from '@/lib/supabase'
import {
  analyticsRangeFromParam,
  parseAnalyticsDashboardPayload,
  sinceIsoForRange,
} from '@/lib/analytics-types'
import AnalyticsDashboardClient from './AnalyticsDashboardClient'

export const dynamic = 'force-dynamic'

type SearchParams = { range?: string }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const range = analyticsRangeFromParam(sp.range)
  const p_since = sinceIsoForRange(range)

  const { data, error } = await supabaseAdmin.rpc('analytics_dashboard', { p_since })

  if (error) {
    console.error('analytics_dashboard RPC failed:', error.message)
  }

  const payload = parseAnalyticsDashboardPayload(data)

  return (
    <AnalyticsDashboardClient initialRange={range} payload={payload} rpcError={error?.message ?? null} />
  )
}
