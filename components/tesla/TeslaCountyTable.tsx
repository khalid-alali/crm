'use client'

import type { TeslaEnrollmentView } from '@/lib/tesla-enrollments'
import { TESLA_STAGES, type TeslaStage } from '@/lib/program-stage'

const STAGE_LABELS: Record<TeslaStage, string> = {
  not_ready: 'Not ready',
  getting_ready: 'Getting ready',
  ready: 'Ready',
  active: 'Active',
  disqualified: 'Disqualified',
}

export default function TeslaCountyTable({ rows }: { rows: TeslaEnrollmentView[] }) {
  const table = buildCountyStageTable(rows)

  return (
    <div className="rounded-xl border border-arctic-200 bg-white">
      <div className="max-h-[min(70vh,640px)] overflow-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border-b border-arctic-200 bg-arctic-50 px-4 py-3 text-left font-semibold text-onix-900 shadow-[0_1px_0_0_rgb(231,229,228)]">
                County
              </th>
              {TESLA_STAGES.map(s => (
                <th
                  key={s}
                  className="sticky top-0 z-10 border-b border-arctic-200 bg-arctic-50 px-3 py-3 text-center font-semibold text-onix-800 shadow-[0_1px_0_0_rgb(231,229,228)]"
                >
                  {STAGE_LABELS[s]}
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-arctic-200 bg-arctic-50 px-3 py-3 text-center font-semibold text-onix-700 shadow-[0_1px_0_0_rgb(231,229,228)]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {table.length === 0 ? (
              <tr>
                <td colSpan={TESLA_STAGES.length + 2} className="px-4 py-8 text-center text-onix-500">
                  No shops match the current filters.
                </td>
              </tr>
            ) : (
              table.map(row => (
                <tr key={row.county}>
                  <td className="border-b border-arctic-100 px-4 py-2.5 font-medium text-onix-900">{row.county}</td>
                  {TESLA_STAGES.map(s => (
                    <td key={s} className="border-b border-arctic-100 px-3 py-2.5 text-center tabular-nums text-onix-700">
                      {row.counts[s]}
                    </td>
                  ))}
                  <td className="border-b border-arctic-100 px-3 py-2.5 text-center tabular-nums font-medium text-onix-900">
                    {row.total}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function buildCountyStageTable(rows: TeslaEnrollmentView[]) {
  type Row = { county: string; counts: Record<TeslaStage, number>; total: number }
  const byCounty = new Map<string, Record<TeslaStage, number>>()

  for (const row of rows) {
    const county = row.county?.trim() || '(No county)'
    if (!byCounty.has(county)) {
      byCounty.set(county, {
        not_ready: 0,
        getting_ready: 0,
        ready: 0,
        active: 0,
        disqualified: 0,
      })
    }
    const c = byCounty.get(county)!
    c[row.stage]++
  }

  const out: Row[] = [...byCounty.entries()].map(([county, counts]) => ({
    county,
    counts,
    total: TESLA_STAGES.reduce((sum, s) => sum + counts[s], 0),
  }))

  out.sort((a, b) => a.county.localeCompare(b.county))
  return out
}
