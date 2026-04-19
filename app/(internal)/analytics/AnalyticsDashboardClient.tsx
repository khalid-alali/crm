'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Card,
  DonutChart,
  Metric,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from '@tremor/react'
import { Info } from 'lucide-react'
import type { AnalyticsDashboardPayload, AnalyticsRangeParam } from '@/lib/analytics-types'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { formatLocationSource } from '@/lib/location-source'

const PIPELINE_ORDER = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive'] as const

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  email: 'Email',
  note: 'Note',
  status_change: 'Status change',
  contract: 'Contract',
  address_update: 'Address update',
  shop_created: 'Shop created',
}

type TabId = 'overview' | 'pipeline' | 'programs' | 'activity'

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'programs', label: 'Programs' },
  { id: 'activity', label: 'Activity' },
]

function formatDayLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function rangeDescription(range: AnalyticsRangeParam) {
  if (range === 'all') return 'All time'
  if (range === '90d') return 'Last 90 days'
  return 'Last 30 days'
}

/** Native `title` tooltip on an info icon (hover / long-press on touch). */
function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <button
      type="button"
      className="-mr-0.5 -mt-0.5 shrink-0 rounded p-1 text-onix-400 hover:bg-arctic-100 hover:text-onix-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      title={text}
      aria-label={`${label}. ${text}`}
    >
      <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </button>
  )
}

function pipelineCountsMap(payload: AnalyticsDashboardPayload) {
  const m = new Map<string, number>()
  for (const row of payload.pipeline_by_status) {
    m.set(row.status, row.count)
  }
  return m
}

function activationPillClass(pct: number) {
  if (pct >= 70) return 'bg-emerald-100 text-emerald-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-900'
  return 'bg-arctic-200 text-onix-700'
}

function shopsStatusHref(status: string) {
  return `/shops?status=${encodeURIComponent(status)}`
}

function PipelineStageRows({
  pipelineBarData,
}: {
  pipelineBarData: { status: string; label: string; count: number; pct: number }[]
}) {
  const max = Math.max(...pipelineBarData.map(d => d.count), 1)
  return (
    <div className="mt-4 space-y-2">
      {pipelineBarData.map(row => (
        <Link
          key={row.status}
          href={shopsStatusHref(row.status)}
          className="group flex items-center gap-3 rounded-md py-1.5 pl-1 pr-0 transition-colors hover:bg-arctic-100"
        >
          <span className="w-24 shrink-0 text-sm text-onix-600 group-hover:text-onix-900">{row.label}</span>
          <div className="min-w-0 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-arctic-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-all group-hover:bg-brand-700"
                style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
              />
            </div>
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-onix-900">{row.count}</span>
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-onix-500">{row.pct}%</span>
        </Link>
      ))}
    </div>
  )
}

type Props = {
  initialRange: AnalyticsRangeParam
  payload: AnalyticsDashboardPayload | null
  rpcError: string | null
}

export default function AnalyticsDashboardClient({ initialRange, payload, rpcError }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('overview')

  const countsByStatus = useMemo(() => (payload ? pipelineCountsMap(payload) : new Map()), [payload])

  const pipelineBarData = useMemo(() => {
    if (!payload) return []
    const total = PIPELINE_ORDER.reduce((s, st) => s + (countsByStatus.get(st) ?? 0), 0) || 1
    return PIPELINE_ORDER.map(status => {
      const count = countsByStatus.get(status) ?? 0
      return {
        status,
        label: LOCATION_STATUS_LABELS[status] ?? status,
        count,
        pct: Math.round((count / total) * 100),
      }
    })
  }, [payload, countsByStatus])

  const contractsChartData = useMemo(() => {
    if (!payload) return []
    const map = new Map<string, number>()
    for (const r of payload.contracts_by_month) {
      const key = r.month.trim()
      map.set(key, (map.get(key) ?? 0) + r.count)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, Contracts]) => ({
        monthKey,
        Contracts,
      }))
  }, [payload])

  const programMixMap = useMemo(() => {
    const m = new Map<string, number>()
    if (!payload) return m
    for (const r of payload.program_mix) m.set(r.segment, r.count)
    return m
  }, [payload])

  const enrolledProgramCount = useMemo(() => {
    const md = programMixMap.get('MD only') ?? 0
    const oem = programMixMap.get('OEM only') ?? 0
    const both = programMixMap.get('Both') ?? 0
    return md + oem + both
  }, [programMixMap])

  const programDonutData = useMemo(() => {
    if (!payload) return []
    return payload.program_mix
      .filter(r => r.count > 0 && r.segment !== 'None')
      .map(r => ({ name: r.segment, value: r.count }))
  }, [payload])

  const noneProgramCount = programMixMap.get('None') ?? 0

  const sourcesChartData = useMemo(() => {
    if (!payload) return []
    return payload.lead_sources.map(r => ({
      source: r.source === 'unknown' ? 'Unknown' : formatLocationSource(r.source),
      Shops: r.count,
    }))
  }, [payload])

  const activityDailyChart = useMemo(() => {
    if (!payload) return []
    return payload.activity_daily.map(r => ({
      day: formatDayLabel(r.day),
      Events: r.count,
    }))
  }, [payload])

  const activityTypeChart = useMemo(() => {
    if (!payload) return []
    return payload.activity_by_type.map(r => ({
      type: ACTIVITY_TYPE_LABELS[r.type] ?? r.type,
      Count: r.count,
    }))
  }, [payload])

  const hasActivityData = useMemo(() => {
    if (!payload) return false
    return (
      payload.activity_by_type.some(r => r.count > 0) || payload.activity_daily.some(r => r.count > 0)
    )
  }, [payload])

  useEffect(() => {
    if (tab === 'activity' && !hasActivityData) setTab('overview')
  }, [tab, hasActivityData])

  const visibleTabs = useMemo(() => {
    if (!payload) return ALL_TABS
    return ALL_TABS.filter(t => t.id !== 'activity' || hasActivityData)
  }, [payload, hasActivityData])

  const onboardingPct = useMemo(() => {
    if (!payload) return null
    const contracted = countsByStatus.get('contracted') ?? 0
    const active = countsByStatus.get('active') ?? 0
    const denom = contracted + active
    if (denom === 0) return null
    return Math.round((active / denom) * 100)
  }, [payload, countsByStatus])

  const maxChainTotal = useMemo(() => {
    if (!payload?.chains_top.length) return 0
    return Math.max(...payload.chains_top.map(c => c.total))
  }, [payload])

  const navigateAnalytics = (nextRange: AnalyticsRangeParam) => {
    router.replace(`/analytics?range=${nextRange}`)
  }

  if (rpcError || !payload) {
    return (
      <div className="p-6">
        <Title className="text-onix-950">Analytics</Title>
        <Text className="mt-2 text-onix-600">
          {rpcError
            ? `Could not load analytics (${rpcError}). Apply migrations 018 and 019 (analytics_dashboard) if this function is missing or outdated.`
            : 'Could not load analytics data.'}
        </Text>
      </div>
    )
  }

  const { kpi } = payload

  const kpiSection = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card decoration="top" decorationColor="blue">
        <div className="flex items-start justify-between gap-1">
          <Text>Total shops</Text>
          <InfoTip
            label="Total shops"
            text={`Shops with created_at in ${rangeDescription(initialRange)} (cohort).`}
          />
        </div>
        <Metric>{kpi.total_shops}</Metric>
      </Card>
      <Card decoration="top" decorationColor="emerald">
        <div className="flex items-start justify-between gap-1">
          <Text>Active (cohort)</Text>
          <InfoTip label="Active (cohort)" text="Same cohort as Total shops." />
        </div>
        <Metric>{kpi.active}</Metric>
      </Card>
      <Card decoration="top" decorationColor="indigo">
        <div className="flex items-start justify-between gap-1">
          <Text>Contracts signed</Text>
          <InfoTip label="Contracts signed" text="By signing date in range; all accounts." />
        </div>
        <Metric>{kpi.contracts_signed}</Metric>
      </Card>
      <Card decoration="top" decorationColor="amber">
        <div className="flex items-start justify-between gap-1">
          <Text>Avg. days to sign</Text>
          <InfoTip
            label="Avg. days to sign"
            text="Cohort shops only; first signed link; calendar days; excludes signing before shop created_at; excludes source historical_migration (import timestamps)."
          />
        </div>
        <Metric>{kpi.avg_days_to_sign != null ? `${kpi.avg_days_to_sign}d` : '—'}</Metric>
      </Card>
      <Card decoration="top" decorationColor="slate">
        <div className="flex items-start justify-between gap-1">
          <Text>Churn (30d)</Text>
          <InfoTip label="Churn (30d)" text="Rolling; not range-scoped." />
        </div>
        <Metric>{kpi.churn_30d}</Metric>
      </Card>
    </div>
  )

  const pipelineCard = (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Title className="min-w-0 flex-1 leading-snug">Pipeline by stage</Title>
        <InfoTip
          label="Pipeline by stage"
          text={`Current snapshot across all shops (not limited to the date cohort). Click a row to open the pipeline filtered to that stage. Onboarding completion (Signed + Active only): ${
            onboardingPct != null ? `${onboardingPct}%` : '—'
          } active of signed+active.`}
        />
      </div>
      <PipelineStageRows pipelineBarData={pipelineBarData} />
    </Card>
  )

  const contractsCard = (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Title className="min-w-0 flex-1 leading-snug">Contracts signed per month</Title>
        <InfoTip
          label="Contracts signed per month"
          text="Buckets are YYYY-MM from signing_date (range filter on signing_date). Axis uses stable month keys so months do not collapse."
        />
      </div>
      <BarChart
        className="mt-4 h-56"
        data={contractsChartData}
        index="monthKey"
        categories={['Contracts']}
        colors={['blue']}
        yAxisWidth={40}
        rotateLabelX={{ angle: -35, verticalShift: 28, xAxisHeight: 56 }}
      />
    </Card>
  )

  const programCard = (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Title className="min-w-0 flex-1 leading-snug">Program enrollment mix</Title>
        <InfoTip
          label="Program enrollment mix"
          text="Cohort shops. Donut shows MD only, OEM only, and Both (active enrollments). Center = shops with at least one active program in those categories."
        />
      </div>
      <DonutChart
        className="mt-4 h-52"
        data={programDonutData}
        category="value"
        index="name"
        colors={['blue', 'emerald', 'amber']}
        showLabel
        label={String(enrolledProgramCount)}
      />
      <Text className="mt-2 text-tremor-content-subtle">
        {noneProgramCount} cohort shop{noneProgramCount === 1 ? '' : 's'} with no active MD/OEM/Both enrollment
        in the sense above.
      </Text>
    </Card>
  )

  const sourcesCard = (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Title className="min-w-0 flex-1 leading-snug">Lead source breakdown</Title>
        <InfoTip
          label="Lead source breakdown"
          text='Cohort shops. Import-style sources normalized to "import" in the database query.'
        />
      </div>
      <BarChart
        className="mt-4 h-56"
        data={sourcesChartData}
        index="source"
        categories={['Shops']}
        colors={['blue']}
        layout="vertical"
        yAxisWidth={112}
      />
    </Card>
  )

  const chainsCard = (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Title className="min-w-0 flex-1 leading-snug">Shops by chain / MSO — top 10</Title>
        <InfoTip
          label="Shops by chain / MSO"
          text="Cohort only. Activation rate = active / total."
        />
      </div>
      <div className="mt-4 space-y-2">
        {payload.chains_top.length === 0 ? (
          <Text>No chain names in this cohort.</Text>
        ) : (
          payload.chains_top.map(c => (
            <div
              key={c.chain_name}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto_auto] items-center gap-3 border-b border-arctic-200 py-2 last:border-0"
            >
              <span className="truncate text-sm font-medium text-onix-900">{c.chain_name}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-arctic-200">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${maxChainTotal ? Math.max(8, (c.total / maxChainTotal) * 100) : 0}%` }}
                />
              </div>
              <span className="text-right text-sm font-medium tabular-nums text-onix-900">{c.total}</span>
              <span className="text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${activationPillClass(c.activation_pct)}`}
                >
                  {c.activation_pct}%
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  )

  const activitySection = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <Title className="min-w-0 flex-1 leading-snug">Activity volume by day</Title>
          <InfoTip label="Activity volume by day" text="All activity_log rows in the selected window." />
        </div>
        <BarChart
          className="mt-4 h-64"
          data={activityDailyChart}
          index="day"
          categories={['Events']}
          colors={['indigo']}
          yAxisWidth={36}
        />
      </Card>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <Title className="min-w-0 flex-1 leading-snug">Activity by type</Title>
          <InfoTip label="Activity by type" text="Counts by audit type in the same window." />
        </div>
        <BarChart
          className="mt-4 h-64"
          data={activityTypeChart}
          index="type"
          categories={['Count']}
          colors={['blue']}
          layout="vertical"
          yAxisWidth={120}
        />
      </Card>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-onix-950">Analytics</h1>
          <Text className="text-tremor-content">Pipeline, contracts, programs, and activity.</Text>
        </div>
        <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full flex-1">
            <Text className="mb-1 text-tremor-label text-tremor-content-subtle">Date range</Text>
            <Select
              value={initialRange}
              onValueChange={v => {
                const next = v === '90d' || v === 'all' ? v : '30d'
                navigateAnalytics(next)
              }}
            >
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-arctic-200 pb-2">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.id
                ? 'bg-arctic-200 font-medium text-onix-950'
                : 'text-onix-600 hover:bg-arctic-100 hover:text-onix-950'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-onix-500">Key metrics</p>
            {kpiSection}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {pipelineCard}
            {contractsCard}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {programCard}
            {sourcesCard}
          </div>
          {chainsCard}
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="space-y-6">
          {pipelineCard}
          {contractsCard}
        </div>
      )}

      {tab === 'programs' && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {programCard}
            {sourcesCard}
          </div>
        </div>
      )}

      {tab === 'activity' && hasActivityData && (
        <div className="space-y-6">
          {activitySection}
          <Card>
            <div className="flex items-start justify-between gap-2">
              <Title className="min-w-0 flex-1 leading-snug">Activity detail</Title>
              <InfoTip label="Activity detail" text="Per-type totals in the selected window." />
            </div>
            <Table className="mt-4">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell className="text-right">Count</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payload.activity_by_type.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Text>No typed activity in this window.</Text>
                    </TableCell>
                  </TableRow>
                ) : (
                  payload.activity_by_type.map(r => (
                    <TableRow key={r.type}>
                      <TableCell>{ACTIVITY_TYPE_LABELS[r.type] ?? r.type}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
