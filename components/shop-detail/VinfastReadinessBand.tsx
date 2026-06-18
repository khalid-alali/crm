'use client'

import { useEffect, useMemo, useState } from 'react'
import { DM_Sans } from 'next/font/google'
import { Check, ChevronDown, ChevronUp, Wifi, X } from 'lucide-react'
import {
  type FacilitySurveyRow,
  formatVinfastSurveyedDate,
  overlapLabel,
  parseVinfastReadiness,
  VINFAST_READINESS_SCORE_TOTAL,
} from '@/lib/vinfast-readiness'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

type Props = {
  survey: FacilitySurveyRow | null
  locationName: string
}

export function VinfastReadinessBand({ survey, locationName }: Props) {
  if (!survey) {
    return (
      <section className={`${dmSans.className} space-y-3.5`} aria-label="VinFast facility readiness">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-zinc-900">
            VinFast Facility Readiness
          </h3>
        </div>
        <p className="text-sm text-zinc-400">No facility survey on file</p>
      </section>
    )
  }

  return <VinfastReadinessBandContent survey={survey} locationName={locationName} />
}

function VinfastReadinessBandContent({
  survey,
  locationName,
}: {
  survey: FacilitySurveyRow
  locationName: string
}) {
  const model = useMemo(() => parseVinfastReadiness(survey, locationName), [survey, locationName])
  const surveyedLabel = formatVinfastSurveyedDate(model.surveyedAt)
  const [expanded, setExpanded] = useState(model.gapCount > 0)

  useEffect(() => {
    setExpanded(model.gapCount > 0)
  }, [model.gapCount, survey])

  const toggle = () => setExpanded(v => !v)

  return (
    <section className={`${dmSans.className} space-y-3.5`} aria-label="VinFast facility readiness">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-zinc-900">
          VinFast Facility Readiness
        </h3>
        {surveyedLabel ? <span className="text-[13px] text-zinc-400">Surveyed {surveyedLabel}</span> : null}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex min-h-[60px] w-full cursor-pointer items-center gap-3.5 px-[18px] py-4 text-left sm:gap-3.5"
        >
          {model.ready ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-[11px] py-1 text-[13px] font-medium text-green-700">
              <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={2.5} aria-hidden />
              VinFast ready
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-[11px] py-1 text-[13px] font-medium text-amber-700">
              <span aria-hidden>⚠</span>
              {model.gapCount} {model.gapCount === 1 ? 'gap' : 'gaps'}
            </span>
          )}

          <span className="shrink-0 text-sm tabular-nums text-zinc-500">
            {model.yesCount} / {VINFAST_READINESS_SCORE_TOTAL}
          </span>

          {model.gapCount > 0 ? (
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {model.gapLabels.map(label => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-[7px] bg-red-50 px-2 py-1 text-[12.5px] text-red-700"
                >
                  <X className="h-3 w-3 shrink-0 text-red-500" strokeWidth={2.5} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          <span className="hidden min-w-0 flex-1 sm:inline" />

          <span className="ml-auto flex shrink-0 items-center gap-4 text-[13px] text-zinc-400">
            {model.wifiMbps != null ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Wifi className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  WiFi <span className="font-medium tabular-nums text-zinc-900">{model.wifiMbps}</span> Mbps
                </span>
              </span>
            ) : null}
            {expanded ? (
              <ChevronUp className="h-[18px] w-[18px] text-zinc-400" aria-hidden />
            ) : (
              <ChevronDown className="h-[18px] w-[18px] text-zinc-400" aria-hidden />
            )}
          </span>
        </button>

        {expanded ? (
          <div className="border-t border-zinc-100 px-[18px] py-[18px]">
            {model.groups.map(group => (
              <div key={group.id} className="mb-[18px] last:mb-0">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
                  {group.label}
                </p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-7 gap-y-2">
                  {group.items.map(item => (
                    <ReadinessCheckRow key={item.key} item={item} />
                  ))}
                </div>
              </div>
            ))}

            {model.notes ? (
              <p className="mt-3.5 border-t border-zinc-100 pt-3.5 text-sm text-zinc-600">
                <span className="font-medium text-zinc-500">Notes · </span>
                {model.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ReadinessCheckRow({
  item,
}: {
  item: {
    key: string
    label: string
    value: 'yes' | 'no' | null
    overlap?: 'capacity' | 'above'
    wifiMbps?: number | null
  }
}) {
  const isNo = item.value === 'no'
  const isYes = item.value === 'yes'

  return (
    <div className={`flex items-center gap-2 text-sm ${isNo ? 'text-zinc-900' : 'text-zinc-900'}`}>
      {isYes ? (
        <Check className="h-[17px] w-[17px] shrink-0 text-green-600" strokeWidth={2.5} aria-hidden />
      ) : isNo ? (
        <X className="h-[17px] w-[17px] shrink-0 text-red-500" strokeWidth={2.5} aria-hidden />
      ) : (
        <span className="inline-block h-[17px] w-[17px] shrink-0 rounded-full border border-zinc-200" aria-hidden />
      )}
      <span className="min-w-0">{item.label}</span>
      {item.overlap ? (
        <span
          className="shrink-0 rounded-[5px] border border-zinc-200 px-1.5 py-px text-[11px] text-zinc-400"
          title={item.overlap === 'capacity' ? 'Also reflected in Capacity → 2-post lifts' : 'Also reflected in Service capabilities / HV meter'}
        >
          {overlapLabel(item.overlap)}
        </span>
      ) : null}
      {item.wifiMbps != null ? (
        <span className="ml-auto shrink-0 pr-2 text-[13px] tabular-nums text-zinc-500">{item.wifiMbps} Mbps</span>
      ) : null}
    </div>
  )
}
