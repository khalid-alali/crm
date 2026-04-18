'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AC_OPTIONS,
  ADAS_OPTIONS,
  ALIGNMENT_OPTIONS,
  BODY_WORK_OPTIONS,
  TIRES_OPTIONS,
  WINDSHIELD_OPTIONS,
  YES_NO_OPTIONS,
  type RadioOpt,
} from '@/lib/portal-capabilities-ui'
import {
  validatePortalAutosaveField,
  type PortalAutosaveKey,
  type PortalAutosaveCtx,
} from '@/lib/portal-autosave'
import {
  PORTAL_INT_MAX,
  allocatedBucketToStoredInt,
  barLicenseDigitsOnly,
  isPortalCapabilitiesFormComplete,
  storedIntToAllocatedBucket,
  validatePortalCapabilitiesForm,
  type AllocatedTechsBucketValue,
  type PortalCapabilitiesFormValues,
  type PortalCapabilitiesFieldKey,
} from '@/lib/portal-capabilities-form'
import {
  DAY_LABELS,
  DAY_ORDER,
  TIME_OPTIONS,
  defaultPortalHoursModel,
  stringifyPortalHours,
  tryParsePortalHoursJson,
  type DayId,
  type PortalHoursModel,
} from '@/lib/portal-hours-schedule'
import { formatUsPhoneDisplay, stripPhoneToNationalDigits } from '@/lib/portal-phone-email'

const ALLOCATED_TO_FIXLANE_OPTIONS: RadioOpt[] = [
  { value: '1_2', label: '1–2' },
  { value: '3_5', label: '3–5' },
  { value: '6_10', label: '6–10' },
  { value: '10_plus', label: '10+' },
]

type PageState =
  | 'loading'
  | 'form'
  | 'already_submitted'
  | 'success'
  | 'expired'
  | 'error'

/** Delay before showing inline validation messages so partial input (e.g. phone) does not flash errors while typing. */
const FIELD_ERROR_DEBOUNCE_MS = 450

type LocationPayload = {
  id: string
  name: string
  state: string | null
  bar_license_number: string | null
  hours_of_operation: string | null
  standard_warranty: string | null
  total_techs: number | null
  allocated_techs: number | null
  daily_appointment_capacity: number | null
  weekly_appointment_capacity: number | null
  capabilities_submitted_at: string | null
  capabilities_parking_spots_rw: number | null
  capabilities_two_post_lifts: number | null
  capabilities_afterhours_tow_ins: string | null
  capabilities_night_drops: string | null
  capabilities_tires: string | null
  capabilities_wheel_alignment: string | null
  capabilities_body_work: string | null
  capabilities_adas: string | null
  capabilities_ac_work: string | null
  capabilities_forklift: string | null
  capabilities_hv_battery_table: string | null
  capabilities_windshields: string | null
  owner: { contact_id: string | null; contact_name: string | null; email: string | null; phone: string | null }
}

function numStr(v: number | null | undefined) {
  return v != null && !Number.isNaN(v) ? String(v) : ''
}

function pickStr(v: string | null | undefined, allowed: readonly string[]) {
  const s = (v ?? '').trim()
  return allowed.includes(s) ? s : ''
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-red-600">{message}</p>
}

function fieldRefSetter(
  refs: React.MutableRefObject<Partial<Record<PortalCapabilitiesFieldKey, HTMLElement | null>>>,
  key: PortalCapabilitiesFieldKey,
) {
  return (el: HTMLElement | null) => {
    refs.current[key] = el
  }
}

export default function PortalCapabilitiesClient({ token }: { token: string }) {
  const [state, setState] = useState<PageState>('loading')
  const [location, setLocation] = useState<LocationPayload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [submitNetworkError, setSubmitNetworkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedShopName, setSubmittedShopName] = useState('')

  const [shopName, setShopName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhoneDigits, setContactPhoneDigits] = useState('')
  const [phoneFocused, setPhoneFocused] = useState(false)

  const [barLicenseDigits, setBarLicenseDigits] = useState('')
  const [hoursModel, setHoursModel] = useState<PortalHoursModel>(() => defaultPortalHoursModel())
  const [hoursLegacyHint, setHoursLegacyHint] = useState<string | null>(null)
  const [standard_warranty, setWarranty] = useState('')
  const [total_techs, setTotalTechs] = useState('')
  const [allocated_techs, setAllocatedTechs] = useState('')
  const [daily_appointment_capacity, setDailyCap] = useState('')
  const [weekly_appointment_capacity, setWeeklyCap] = useState('')
  const [parking_spots_rw, setParking] = useState('')
  const [two_post_lifts, setLifts] = useState('')
  const [afterhours_tow_ins, setTow] = useState('')
  const [night_drops, setNightDrops] = useState('')
  const [tires, setTires] = useState('')
  const [wheel_alignment, setAlignment] = useState('')
  const [body_work, setBodyWork] = useState('')
  const [adas, setAdas] = useState('')
  const [ac_work, setAc] = useState('')
  const [forklift, setForklift] = useState('')
  const [hv_battery_table, setHvTable] = useState('')
  const [windshields, setWindshields] = useState('')

  const pendingPatchRef = useRef<Partial<Record<PortalAutosaveKey, unknown>>>({})
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fieldRefs = useRef<Partial<Record<PortalCapabilitiesFieldKey, HTMLElement | null>>>({})

  const isCA = useMemo(() => {
    const s = (location?.state ?? '').trim().toUpperCase()
    return s === 'CA' || s === 'CALIFORNIA'
  }, [location?.state])

  const formSnapshot: PortalCapabilitiesFormValues = useMemo(
    () => ({
      isCA,
      shopName,
      contactName,
      contactEmail,
      contactPhoneDigits,
      barLicenseDigits,
      hoursModel,
      standardWarranty: standard_warranty,
      totalTechs: total_techs,
      allocatedTechs: allocated_techs,
      dailyCap: daily_appointment_capacity,
      weeklyCap: weekly_appointment_capacity,
      parking: parking_spots_rw,
      lifts: two_post_lifts,
      afterhours_tow_ins,
      night_drops,
      tires,
      wheel_alignment,
      body_work,
      adas,
      ac_work,
      forklift,
      hv_battery_table,
      windshields,
    }),
    [
      isCA,
      shopName,
      contactName,
      contactEmail,
      contactPhoneDigits,
      barLicenseDigits,
      hoursModel,
      standard_warranty,
      total_techs,
      allocated_techs,
      daily_appointment_capacity,
      weekly_appointment_capacity,
      parking_spots_rw,
      two_post_lifts,
      afterhours_tow_ins,
      night_drops,
      tires,
      wheel_alignment,
      body_work,
      adas,
      ac_work,
      forklift,
      hv_battery_table,
      windshields,
    ],
  )

  const formSnapshotRef = useRef(formSnapshot)
  formSnapshotRef.current = formSnapshot

  const canSubmit = useMemo(() => isPortalCapabilitiesFormComplete(formSnapshot), [formSnapshot])

  const [displayedErrors, setDisplayedErrors] = useState<Partial<Record<PortalCapabilitiesFieldKey, string>>>({})
  const [touchedFields, setTouchedFields] = useState<Partial<Record<PortalCapabilitiesFieldKey, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const markTouched = useCallback((k: PortalCapabilitiesFieldKey) => {
    setTouchedFields(prev => (prev[k] ? prev : { ...prev, [k]: true }))
  }, [])

  const flushDisplayedErrors = useCallback(() => {
    setDisplayedErrors(validatePortalCapabilitiesForm(formSnapshotRef.current).errors)
  }, [])

  useEffect(() => {
    const id = setTimeout(flushDisplayedErrors, FIELD_ERROR_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [formSnapshot, flushDisplayedErrors])

  const visibleErrors = useMemo(() => {
    if (submitAttempted) return displayedErrors
    const out: Partial<Record<PortalCapabilitiesFieldKey, string>> = {}
    const t = touchedFields
    const show = (k: PortalCapabilitiesFieldKey) =>
      !!t[k] ||
      (k === 'allocated_techs' && !!t.total_techs) ||
      (k === 'total_techs' && !!t.allocated_techs)
    for (const key of Object.keys(displayedErrors) as PortalCapabilitiesFieldKey[]) {
      const err = displayedErrors[key]
      if (err && show(key)) out[key] = err
    }
    return out
  }, [displayedErrors, touchedFields, submitAttempted])

  useEffect(() => {
    if (canSubmit) setSubmitAttempted(false)
  }, [canSubmit])

  const flushAutosave = useCallback(async () => {
    const patch = { ...pendingPatchRef.current } as Record<string, unknown>
    pendingPatchRef.current = {}
    if (Object.keys(patch).length === 0) return
    try {
      await fetch('/api/portal/autosave', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, patch }),
      })
    } catch {
      /* silent: autosave is best-effort; submit will persist */
    }
  }, [token])

  const autosaveCtx: PortalAutosaveCtx = useMemo(
    () => ({ isCA, totalTechsInput: total_techs, allocatedTechsInput: allocated_techs }),
    [isCA, total_techs, allocated_techs],
  )

  const scheduleFieldSave = useCallback(
    (key: PortalAutosaveKey, value: unknown) => {
      if (validatePortalAutosaveField(key, value, autosaveCtx) !== null) return
      pendingPatchRef.current[key] = value
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        void flushAutosave()
      }, 500)
    },
    [autosaveCtx, flushAutosave],
  )

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState('loading')
      setLoadError('')
      try {
        const res = await fetch(`/api/portal/location?token=${encodeURIComponent(token)}`)
        if (res.status === 401) {
          if (!cancelled) setState('expired')
          return
        }
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(typeof data.error === 'string' ? data.error : 'Something went wrong')
            setState('error')
          }
          return
        }
        const loc = data.location as LocationPayload | undefined
        if (!loc) {
          if (!cancelled) {
            setLoadError('Invalid response')
            setState('error')
          }
          return
        }
        if (!cancelled) {
          setLocation(loc)
          setShopName(loc.name ?? '')
          setContactName(loc.owner.contact_name ?? '')
          setContactEmail(loc.owner.email ?? '')
          setContactPhoneDigits(stripPhoneToNationalDigits(loc.owner.phone ?? ''))
          setPhoneFocused(false)
          const rawBar = loc.bar_license_number ?? ''
          setBarLicenseDigits(barLicenseDigitsOnly(rawBar))
          const rawHours = (loc.hours_of_operation ?? '').trim()
          const parsedHours = tryParsePortalHoursJson(rawHours)
          if (parsedHours) {
            setHoursModel(parsedHours)
            setHoursLegacyHint(null)
          } else {
            setHoursModel(defaultPortalHoursModel())
            setHoursLegacyHint(rawHours || null)
          }
          setWarranty(loc.standard_warranty ?? '')
          setTotalTechs(numStr(loc.total_techs))
          setAllocatedTechs(storedIntToAllocatedBucket(loc.allocated_techs))
          setDailyCap(numStr(loc.daily_appointment_capacity))
          setWeeklyCap(numStr(loc.weekly_appointment_capacity))
          setParking(numStr(loc.capabilities_parking_spots_rw))
          setLifts(numStr(loc.capabilities_two_post_lifts))
          setTow(pickStr(loc.capabilities_afterhours_tow_ins, ['yes', 'no']))
          setNightDrops(pickStr(loc.capabilities_night_drops, ['yes', 'no']))
          setTires(pickStr(loc.capabilities_tires, ['machine_balancer', 'sublet', 'no']))
          setAlignment(pickStr(loc.capabilities_wheel_alignment, ['in_shop', 'sublet', 'no']))
          setBodyWork(pickStr(loc.capabilities_body_work, ['in_shop', 'sublet', 'no']))
          setAdas(pickStr(loc.capabilities_adas, ['in_shop', 'sublet', 'no']))
          setAc(pickStr(loc.capabilities_ac_work, ['r134a', 'r1234yf', 'both', 'no']))
          setForklift(pickStr(loc.capabilities_forklift, ['yes', 'no']))
          setHvTable(pickStr(loc.capabilities_hv_battery_table, ['yes', 'no']))
          setWindshields(pickStr(loc.capabilities_windshields, ['in_shop', 'sublet', 'no']))
          setSubmitNetworkError('')
          setTouchedFields({})
          setSubmitAttempted(false)
          setState(loc.capabilities_submitted_at ? 'already_submitted' : 'form')
        }
      } catch {
        if (!cancelled) {
          setLoadError('Network error')
          setState('error')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  function updateHoursModel(updater: (m: PortalHoursModel) => PortalHoursModel) {
    markTouched('hours_of_operation')
    setHoursModel(m => {
      const next = updater(m)
      queueMicrotask(() => scheduleFieldSave('hours_of_operation', stringifyPortalHours(next)))
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitNetworkError('')

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    await flushAutosave()

    const { errors, firstKey } = validatePortalCapabilitiesForm(formSnapshot)
    if (Object.keys(errors).length > 0) {
      setSubmitAttempted(true)
      setDisplayedErrors(errors)
      if (firstKey) {
        fieldRefs.current[firstKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    setSubmitting(true)
    setSubmittedShopName(shopName.trim())
    const phoneOut = contactPhoneDigits.length === 10 ? contactPhoneDigits : ''
    try {
      const res = await fetch('/api/portal/submit-capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          shop_name: shopName.trim(),
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: phoneOut,
          bar_license_number: isCA ? barLicenseDigits : undefined,
          hours_of_operation: stringifyPortalHours(hoursModel),
          standard_warranty: standard_warranty.trim(),
          total_techs: parseInt(total_techs, 10),
          allocated_techs: allocatedBucketToStoredInt(allocated_techs as AllocatedTechsBucketValue),
          daily_appointment_capacity: parseInt(daily_appointment_capacity, 10),
          weekly_appointment_capacity: parseInt(weekly_appointment_capacity, 10),
          parking_spots_rw: parseInt(parking_spots_rw, 10),
          two_post_lifts: parseInt(two_post_lifts, 10),
          afterhours_tow_ins,
          night_drops,
          tires,
          wheel_alignment,
          body_work,
          adas,
          ac_work,
          forklift,
          hv_battery_table,
          windshields,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitNetworkError(typeof data.error === 'string' ? data.error : 'Could not save')
        return
      }
      setState('success')
    } catch {
      setSubmitNetworkError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight text-gray-900">Fixlane</div>
          <p className="mt-1 text-sm text-gray-500">Shop capabilities</p>
        </header>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
              <p className="mt-3 text-sm">Loading…</p>
            </div>
          )}

          {state === 'expired' && (
            <div className="py-10 text-center">
              <h1 className="text-lg font-semibold text-gray-900">Link expired</h1>
              <p className="mt-2 text-sm text-gray-600">This link is no longer valid. Please contact Fixlane for a new link.</p>
            </div>
          )}

          {state === 'error' && (
            <div className="py-10 text-center">
              <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
              <p className="mt-2 text-sm text-gray-600">{loadError || 'Please try again later.'}</p>
            </div>
          )}

          {state === 'already_submitted' && location && (
            <div className="py-10 text-center">
              <h1 className="text-lg font-semibold text-gray-900">Already submitted</h1>
              <p className="mt-2 text-sm text-gray-600">
                Thank you — we already received the capabilities form for{' '}
                <span className="font-medium">{location.name}</span>.
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="py-10 text-center">
              <h1 className="text-lg font-semibold text-gray-900">Thank you</h1>
              <p className="mt-2 text-sm text-gray-600">
                Your information for <span className="font-medium">{submittedShopName}</span> has been saved.
              </p>
            </div>
          )}

          {state === 'form' && location && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Shop &amp; contact</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Confirm or update how we should reach you. This updates your shop record in Fixlane.
                </p>
              </div>

              <div className="space-y-3">
                <div ref={fieldRefSetter(fieldRefs, 'shop_name')}>
                  <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">Shop name *</label>
                  <input
                    value={shopName}
                    onChange={e => {
                      markTouched('shop_name')
                      setShopName(e.target.value)
                    }}
                    onBlur={() => {
                      scheduleFieldSave('shop_name', shopName)
                      flushDisplayedErrors()
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="organization"
                    aria-invalid={!!visibleErrors.shop_name}
                  />
                  <FieldError message={visibleErrors.shop_name} />
                </div>
                <div ref={fieldRefSetter(fieldRefs, 'contact_name')}>
                  <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">Contact name *</label>
                  <input
                    value={contactName}
                    onChange={e => {
                      markTouched('contact_name')
                      setContactName(e.target.value)
                    }}
                    onBlur={() => {
                      scheduleFieldSave('contact_name', contactName)
                      flushDisplayedErrors()
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="name"
                    aria-invalid={!!visibleErrors.contact_name}
                  />
                  <FieldError message={visibleErrors.contact_name} />
                </div>
                <div ref={fieldRefSetter(fieldRefs, 'contact_email')}>
                  <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">Email *</label>
                  <input
                    type="text"
                    value={contactEmail}
                    onChange={e => {
                      markTouched('contact_email')
                      setContactEmail(e.target.value)
                    }}
                    onBlur={() => {
                      scheduleFieldSave('contact_email', contactEmail)
                      flushDisplayedErrors()
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={!!visibleErrors.contact_email}
                  />
                  <FieldError message={visibleErrors.contact_email} />
                </div>
                <div ref={fieldRefSetter(fieldRefs, 'contact_phone')}>
                  <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phoneFocused ? contactPhoneDigits : formatUsPhoneDisplay(contactPhoneDigits)}
                    onFocus={() => setPhoneFocused(true)}
                    onChange={e => {
                      markTouched('contact_phone')
                      const raw = e.target.value
                      const d = stripPhoneToNationalDigits(raw)
                      setContactPhoneDigits(d)
                    }}
                    onBlur={() => {
                      setPhoneFocused(false)
                      const d = stripPhoneToNationalDigits(contactPhoneDigits)
                      setContactPhoneDigits(d)
                      scheduleFieldSave('contact_phone', d)
                      flushDisplayedErrors()
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="tel"
                    aria-invalid={!!visibleErrors.contact_phone}
                  />
                  <FieldError message={visibleErrors.contact_phone} />
                </div>
              </div>

              <div ref={fieldRefSetter(fieldRefs, 'standard_warranty')}>
                <label className="mb-1 flex flex-wrap items-center text-sm font-medium text-gray-900">
                  Standard warranty for repairs *
                </label>
                <textarea
                  value={standard_warranty}
                  onChange={e => {
                    markTouched('standard_warranty')
                    setWarranty(e.target.value)
                  }}
                  onBlur={() => {
                    scheduleFieldSave('standard_warranty', standard_warranty)
                    flushDisplayedErrors()
                  }}
                  rows={3}
                  placeholder="e.g. 12 months / 12,000 miles"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-invalid={!!visibleErrors.standard_warranty}
                />
                <FieldError message={visibleErrors.standard_warranty} />
              </div>

              <IntField
                fieldKey="total_techs"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'total_techs')}
                label="How many techs do you have working full time at your shop?"
                required
                value={total_techs}
                onChange={setTotalTechs}
                onBlur={() => {
                  scheduleFieldSave('total_techs', total_techs)
                  flushDisplayedErrors()
                }}
                max={PORTAL_INT_MAX.total_techs}
                error={visibleErrors.total_techs}
              />
              <RadioBlock
                fieldKey="allocated_techs"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'allocated_techs')}
                legend="How many techs can you allocate to the Fixlane program?"
                required
                options={ALLOCATED_TO_FIXLANE_OPTIONS}
                value={allocated_techs}
                onChange={v => {
                  setAllocatedTechs(v)
                  scheduleFieldSave('allocated_techs', allocatedBucketToStoredInt(v as AllocatedTechsBucketValue))
                  flushDisplayedErrors()
                }}
                name="allocated"
                error={visibleErrors.allocated_techs}
              />
              <IntField
                fieldKey="daily_appointment_capacity"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'daily_appointment_capacity')}
                label="How many Fixlane appointments can you support per day?"
                required
                value={daily_appointment_capacity}
                onChange={setDailyCap}
                onBlur={() => {
                  scheduleFieldSave('daily_appointment_capacity', daily_appointment_capacity)
                  flushDisplayedErrors()
                }}
                max={PORTAL_INT_MAX.daily_appointment_capacity}
                error={visibleErrors.daily_appointment_capacity}
              />
              <IntField
                fieldKey="weekly_appointment_capacity"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'weekly_appointment_capacity')}
                label="How many Fixlane appointments can you support per week?"
                required
                value={weekly_appointment_capacity}
                onChange={setWeeklyCap}
                onBlur={() => {
                  scheduleFieldSave('weekly_appointment_capacity', weekly_appointment_capacity)
                  flushDisplayedErrors()
                }}
                max={PORTAL_INT_MAX.weekly_appointment_capacity}
                error={visibleErrors.weekly_appointment_capacity}
              />
              <IntField
                fieldKey="parking_spots_rw"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'parking_spots_rw')}
                label="How many parking spots do you have that you could reserve for Fixlane vehicles?"
                required
                value={parking_spots_rw}
                onChange={setParking}
                onBlur={() => {
                  scheduleFieldSave('parking_spots_rw', parking_spots_rw)
                  flushDisplayedErrors()
                }}
                max={PORTAL_INT_MAX.parking_spots_rw}
                error={visibleErrors.parking_spots_rw}
              />
              <IntField
                fieldKey="two_post_lifts"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'two_post_lifts')}
                label="How many 2-post lifts do you have on-site?"
                required
                value={two_post_lifts}
                onChange={setLifts}
                onBlur={() => {
                  scheduleFieldSave('two_post_lifts', two_post_lifts)
                  flushDisplayedErrors()
                }}
                max={PORTAL_INT_MAX.two_post_lifts}
                error={visibleErrors.two_post_lifts}
              />

              <RadioBlock
                fieldKey="afterhours_tow_ins"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'afterhours_tow_ins')}
                legend="Does your shop accept afterhour tow-ins?"
                required
                options={YES_NO_OPTIONS}
                value={afterhours_tow_ins}
                onChange={v => {
                  setTow(v)
                  scheduleFieldSave('afterhours_tow_ins', v)
                }}
                name="tow"
                error={visibleErrors.afterhours_tow_ins}
              />
              <RadioBlock
                fieldKey="night_drops"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'night_drops')}
                legend="Does your shop accept night-drops?"
                required
                options={YES_NO_OPTIONS}
                value={night_drops}
                onChange={v => {
                  setNightDrops(v)
                  scheduleFieldSave('night_drops', v)
                }}
                name="night"
                error={visibleErrors.night_drops}
              />
              <RadioBlock
                fieldKey="tires"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'tires')}
                legend="Can your shop remove, replace, and balance tires?"
                required
                options={TIRES_OPTIONS}
                value={tires}
                onChange={v => {
                  setTires(v)
                  scheduleFieldSave('tires', v)
                }}
                name="tires"
                error={visibleErrors.tires}
              />
              <RadioBlock
                fieldKey="wheel_alignment"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'wheel_alignment')}
                legend="Can your shop perform wheel alignments?"
                required
                options={ALIGNMENT_OPTIONS}
                value={wheel_alignment}
                onChange={v => {
                  setAlignment(v)
                  scheduleFieldSave('wheel_alignment', v)
                }}
                name="align"
                error={visibleErrors.wheel_alignment}
              />
              <RadioBlock
                fieldKey="body_work"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'body_work')}
                legend="Can your shop perform body work? (Dents, scratches, glass, etc.)"
                required
                options={BODY_WORK_OPTIONS}
                value={body_work}
                onChange={v => {
                  setBodyWork(v)
                  scheduleFieldSave('body_work', v)
                }}
                name="body"
                error={visibleErrors.body_work}
              />
              <RadioBlock
                fieldKey="adas"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'adas')}
                legend="Can your shop perform ADAS calibrations?"
                required
                options={ADAS_OPTIONS}
                value={adas}
                onChange={v => {
                  setAdas(v)
                  scheduleFieldSave('adas', v)
                }}
                name="adas"
                error={visibleErrors.adas}
              />
              <RadioBlock
                fieldKey="ac_work"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'ac_work')}
                legend="Is your shop certified and equipped to perform A/C work?"
                required
                options={AC_OPTIONS}
                value={ac_work}
                onChange={v => {
                  setAc(v)
                  scheduleFieldSave('ac_work', v)
                }}
                name="ac"
                error={visibleErrors.ac_work}
              />
              <RadioBlock
                fieldKey="forklift"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'forklift')}
                legend="Does your shop have a forklift? (For maneuvering HV batteries)"
                required
                options={YES_NO_OPTIONS}
                value={forklift}
                onChange={v => {
                  setForklift(v)
                  scheduleFieldSave('forklift', v)
                }}
                name="fork"
                error={visibleErrors.forklift}
              />
              <RadioBlock
                fieldKey="hv_battery_table"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'hv_battery_table')}
                legend="Does your shop have an HV battery or scissor table?"
                required
                options={YES_NO_OPTIONS}
                value={hv_battery_table}
                onChange={v => {
                  setHvTable(v)
                  scheduleFieldSave('hv_battery_table', v)
                }}
                name="hv"
                error={visibleErrors.hv_battery_table}
              />
              <RadioBlock
                fieldKey="windshields"
                onFieldInteract={markTouched}
                fieldRef={fieldRefSetter(fieldRefs, 'windshields')}
                legend="Can your shop replace front/rear windshields?"
                required
                options={WINDSHIELD_OPTIONS}
                value={windshields}
                onChange={v => {
                  setWindshields(v)
                  scheduleFieldSave('windshields', v)
                }}
                name="glass"
                error={visibleErrors.windshields}
              />

              {isCA && (
                <div ref={fieldRefSetter(fieldRefs, 'bar_license_number')}>
                  <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">BAR license number *</label>
                  <input
                    value={barLicenseDigits}
                    onChange={e => {
                      markTouched('bar_license_number')
                      setBarLicenseDigits(barLicenseDigitsOnly(e.target.value))
                    }}
                    onBlur={() => {
                      scheduleFieldSave('bar_license_number', barLicenseDigits)
                      flushDisplayedErrors()
                    }}
                    placeholder="e.g. 123456"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="off"
                    inputMode="numeric"
                    aria-invalid={!!visibleErrors.bar_license_number}
                  />
                  <FieldError message={visibleErrors.bar_license_number} />
                </div>
              )}

              <div ref={fieldRefSetter(fieldRefs, 'hours_of_operation')}>
                <label className="mb-1 flex flex-wrap items-center text-xs font-medium text-gray-700">Hours of operation *</label>
                {hoursLegacyHint && (
                  <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Previously saved as free text: <span className="font-medium">{hoursLegacyHint}</span>. Use the
                    schedule below to confirm or replace.
                  </p>
                )}
                <HoursScheduleEditor model={hoursModel} onChange={updateHoursModel} />
                <FieldError message={visibleErrors.hours_of_operation} />
              </div>

              {submitNetworkError && <p className="text-sm text-red-600">{submitNetworkError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full rounded-md bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 ${!canSubmit && !submitting ? 'opacity-60' : ''}`}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function HoursScheduleEditor({
  model,
  onChange,
}: {
  model: PortalHoursModel
  onChange: (u: (m: PortalHoursModel) => PortalHoursModel) => void
}) {
  function setDay(id: DayId, patch: Partial<PortalHoursModel['days'][DayId]>) {
    onChange(m => ({
      ...m,
      days: { ...m.days, [id]: { ...m.days[id], ...patch } },
    }))
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      {DAY_ORDER.map(id => {
        const row = model.days[id]
        return (
          <div
            key={id}
            className="flex flex-col gap-2 border-b border-gray-200 py-2 last:border-0 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="w-12 shrink-0 text-sm font-medium text-gray-800">{DAY_LABELS[id]}</div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={row.closed} onChange={e => setDay(id, { closed: e.target.checked })} />
              Closed
            </label>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 sm:max-w-[9rem]"
                disabled={row.closed}
                value={row.open}
                onChange={e => setDay(id, { open: e.target.value })}
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="hidden text-gray-500 sm:inline">to</span>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 sm:max-w-[9rem]"
                disabled={row.closed}
                value={row.close}
                onChange={e => setDay(id, { close: e.target.value })}
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function IntField({
  fieldKey,
  onFieldInteract,
  label,
  required,
  value,
  onChange,
  onBlur,
  max,
  error,
  fieldRef,
}: {
  fieldKey: PortalCapabilitiesFieldKey
  onFieldInteract: (k: PortalCapabilitiesFieldKey) => void
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  max: number
  error?: string
  fieldRef: (el: HTMLElement | null) => void
}) {
  return (
    <div ref={fieldRef}>
      <label className="mb-1 flex flex-wrap items-center text-sm font-medium text-gray-900">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        type="number"
        min={0}
        max={max}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={e => {
          onFieldInteract(fieldKey)
          const t = e.target.value
          if (t === '') {
            onChange('')
            return
          }
          const n = parseInt(t, 10)
          if (Number.isNaN(n)) return
          onChange(String(Math.min(max, Math.max(0, n))))
        }}
        onBlur={onBlur}
        className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
        aria-invalid={!!error}
      />
      <FieldError message={error} />
    </div>
  )
}

function RadioBlock({
  fieldKey,
  onFieldInteract,
  legend,
  required,
  options,
  value,
  onChange,
  name,
  error,
  fieldRef,
}: {
  fieldKey: PortalCapabilitiesFieldKey
  onFieldInteract: (k: PortalCapabilitiesFieldKey) => void
  legend: string
  required?: boolean
  options: RadioOpt[]
  value: string
  onChange: (v: string) => void
  name: string
  error?: string
  fieldRef: (el: HTMLElement | null) => void
}) {
  return (
    <fieldset ref={fieldRef} className="space-y-2">
      <legend className="flex flex-wrap items-center text-sm font-medium text-gray-900">
        {legend}
        {required ? ' *' : ''}
      </legend>
      <div className="space-y-2 pl-0.5">
        {options.map(opt => (
          <label key={opt.value} className="flex cursor-pointer gap-2 text-sm text-gray-800">
            <input
              type="radio"
              className="mt-0.5"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => {
                onFieldInteract(fieldKey)
                onChange(opt.value)
              }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      <FieldError message={error} />
    </fieldset>
  )
}
