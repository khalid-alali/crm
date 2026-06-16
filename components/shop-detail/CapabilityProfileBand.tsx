'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CAPABILITY_PROFILE_DIMENSIONS,
  type CapabilityProfileField,
  type CapabilityProfileState,
} from '@/lib/capability-profile'

type Props = {
  locationId: string
  profile: CapabilityProfileState
  readOnly?: boolean
}

export function CapabilityProfileBand({ locationId, profile: initialProfile, readOnly = false }: Props) {
  const [profile, setProfile] = useState(initialProfile)
  const [savingField, setSavingField] = useState<CapabilityProfileField | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setProfile(initialProfile)
  }, [initialProfile])

  const showError = useCallback((message: string) => {
    setError(message)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), 5000)
  }, [])

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [])

  async function persistField(field: CapabilityProfileField, value: string) {
    const previous = profile
    const optimistic: CapabilityProfileState = { ...profile, [field]: value }
    setProfile(optimistic)
    setSavingField(field)

    try {
      const res = await fetch(`/api/locations/${locationId}/capability-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = (await res.json()) as CapabilityProfileState & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not save capability profile')
      }
      setProfile({
        eligibility: data.eligibility ?? optimistic.eligibility,
        auto_depth: data.auto_depth ?? optimistic.auto_depth,
        lv_depth: data.lv_depth ?? optimistic.lv_depth,
        hv_depth: data.hv_depth ?? optimistic.hv_depth,
        adas_depth: data.adas_depth ?? optimistic.adas_depth,
        profile_set_by: data.profile_set_by ?? optimistic.profile_set_by,
        profile_set_at: data.profile_set_at ?? optimistic.profile_set_at,
      })
    } catch (err) {
      setProfile(previous)
      showError(err instanceof Error ? err.message : 'Could not save capability profile')
    } finally {
      setSavingField(null)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-arctic-200 bg-white px-5 py-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-onix-500">Capability profile</p>
          <span className="text-xs text-onix-400">Set manually · used for routing</span>
        </div>

        <div className="divide-y divide-arctic-100">
          {CAPABILITY_PROFILE_DIMENSIONS.map(dim => {
            const current = profile[dim.field]
            return (
              <div
                key={dim.field}
                className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[150px_1fr] sm:gap-5"
              >
                <div>
                  <div className="text-sm text-onix-600">{dim.label}</div>
                  <div className="text-xs text-onix-400">{dim.subLabel}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <SegmentedRadioGroup
                    ariaLabel={dim.ariaLabel}
                    variant={dim.variant}
                    options={dim.options}
                    value={current}
                    disabled={readOnly || savingField === dim.field}
                    onChange={next => {
                      if (readOnly || next === current) return
                      void persistField(dim.field, next)
                    }}
                  />
                  {current === null ? (
                    <span className="text-xs text-onix-400">Not set</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-lg"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </>
  )
}

function SegmentedRadioGroup({
  ariaLabel,
  variant,
  options,
  value,
  disabled,
  onChange,
}: {
  ariaLabel: string
  variant: 'neutral' | 'violet'
  options: { value: string; label: string }[]
  value: string | null
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const selectedIndex = value === null ? -1 : options.findIndex(o => o.value === value)
  const [focusIndex, setFocusIndex] = useState(() => (selectedIndex >= 0 ? selectedIndex : 0))
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (selectedIndex >= 0) setFocusIndex(selectedIndex)
  }, [selectedIndex])

  const selectedClass =
    variant === 'violet'
      ? 'bg-violet-600 text-white font-medium'
      : 'bg-zinc-900 text-white font-medium'

  function moveFocus(delta: number) {
    const next = (focusIndex + delta + options.length) % options.length
    setFocusIndex(next)
    buttonRefs.current[next]?.focus()
  }

  return (
    <span
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-lg border border-zinc-200 bg-white"
    >
      {options.map((option, index) => {
        const checked = value === option.value
        const tabIndex = index === focusIndex ? 0 : -1
        return (
          <button
            key={option.value}
            ref={el => {
              buttonRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabIndex}
            disabled={disabled}
            onFocus={() => setFocusIndex(index)}
            onClick={() => {
              if (!checked) onChange(option.value)
            }}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                moveFocus(1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                moveFocus(-1)
              } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                if (!checked) onChange(option.value)
              }
            }}
            className={[
              'border-r border-zinc-200 px-4 py-2 text-sm last:border-r-0',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-60',
              checked ? selectedClass : 'bg-white text-zinc-500 hover:bg-zinc-50',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </span>
  )
}
