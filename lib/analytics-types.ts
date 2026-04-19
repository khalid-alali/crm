/** Row shapes returned by `public.analytics_dashboard` (jsonb). */

export type AnalyticsRangeParam = '30d' | '90d' | 'all'

export type AnalyticsKpi = {
  total_shops: number
  active: number
  contracts_signed: number
  avg_days_to_sign: number | null
  churn_30d: number
}

export type PipelineStatusRow = {
  status: string
  count: number
}

export type ContractMonthRow = {
  month: string
  count: number
}

export type ProgramMixRow = {
  segment: string
  count: number
}

export type LeadSourceRow = {
  source: string
  count: number
}

export type ChainTopRow = {
  chain_name: string
  total: number
  active: number
  activation_pct: number
}

export type ActivityTypeRow = {
  type: string
  count: number
}

export type ActivityDailyRow = {
  day: string
  count: number
}

export type AnalyticsDashboardPayload = {
  kpi: AnalyticsKpi
  pipeline_by_status: PipelineStatusRow[]
  contracts_by_month: ContractMonthRow[]
  program_mix: ProgramMixRow[]
  lead_sources: LeadSourceRow[]
  chains_top: ChainTopRow[]
  activity_by_type: ActivityTypeRow[]
  activity_daily: ActivityDailyRow[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return 0
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : ''
}

export function parseAnalyticsDashboardPayload(raw: unknown): AnalyticsDashboardPayload | null {
  if (!isRecord(raw)) return null

  const kpiRaw = raw.kpi
  if (!isRecord(kpiRaw)) return null

  const kpi: AnalyticsKpi = {
    total_shops: num(kpiRaw.total_shops),
    active: num(kpiRaw.active),
    contracts_signed: num(kpiRaw.contracts_signed),
    avg_days_to_sign: nullableNum(kpiRaw.avg_days_to_sign),
    churn_30d: num(kpiRaw.churn_30d),
  }

  const pipeline_by_status: PipelineStatusRow[] = Array.isArray(raw.pipeline_by_status)
    ? raw.pipeline_by_status
        .filter(isRecord)
        .map(r => ({ status: str(r.status), count: num(r.count) }))
    : []

  const contracts_by_month: ContractMonthRow[] = Array.isArray(raw.contracts_by_month)
    ? raw.contracts_by_month
        .filter(isRecord)
        .map(r => ({ month: str(r.month), count: num(r.count) }))
    : []

  const program_mix: ProgramMixRow[] = Array.isArray(raw.program_mix)
    ? raw.program_mix
        .filter(isRecord)
        .map(r => ({ segment: str(r.segment), count: num(r.count) }))
    : []

  const lead_sources: LeadSourceRow[] = Array.isArray(raw.lead_sources)
    ? raw.lead_sources
        .filter(isRecord)
        .map(r => ({ source: str(r.source), count: num(r.count) }))
    : []

  const chains_top: ChainTopRow[] = Array.isArray(raw.chains_top)
    ? raw.chains_top
        .filter(isRecord)
        .map(r => ({
          chain_name: str(r.chain_name),
          total: num(r.total),
          active: num(r.active),
          activation_pct: num(r.activation_pct),
        }))
    : []

  const activity_by_type: ActivityTypeRow[] = Array.isArray(raw.activity_by_type)
    ? raw.activity_by_type
        .filter(isRecord)
        .map(r => ({ type: str(r.type), count: num(r.count) }))
    : []

  const activity_daily: ActivityDailyRow[] = Array.isArray(raw.activity_daily)
    ? raw.activity_daily
        .filter(isRecord)
        .map(r => ({ day: str(r.day), count: num(r.count) }))
    : []

  return {
    kpi,
    pipeline_by_status,
    contracts_by_month,
    program_mix,
    lead_sources,
    chains_top,
    activity_by_type,
    activity_daily,
  }
}

export function analyticsRangeFromParam(v: string | undefined): AnalyticsRangeParam {
  if (v === '90d' || v === 'all') return v
  return '30d'
}

/** ISO timestamptz for `p_since`, or `null` for all time. */
export function sinceIsoForRange(range: AnalyticsRangeParam): string | null {
  if (range === 'all') return null
  const days = range === '90d' ? 90 : 30
  return new Date(Date.now() - days * 86400000).toISOString()
}
