/** Shop Facility Survey → VinFast Readiness band (14 scored booleans). */

export type VinfastReadinessOverlap = 'capacity' | 'above'

export type VinfastReadinessFieldKey =
  | 'min_two_bays_one_lift'
  | 'customer_lounge'
  | 'service_desk_counter'
  | 'advisor_computers_phones'
  | 'shop_signage'
  | 'service_area_power_wifi'
  | 'hv_safety_equipment'
  | 'wall_charger_space'
  | 'spare_parts_area'
  | 'acting_manager'
  | 'vf_trained_technician'
  | 'vf_customer_ready'
  | 'vf_stock_inventory_tracking'
  | 'customer_greeter'

export type VinfastReadinessGroupId = 'facility' | 'vinfast_program' | 'staffing'

export type VinfastReadinessFieldDef = {
  key: VinfastReadinessFieldKey
  label: string
  group: VinfastReadinessGroupId
  overlap?: VinfastReadinessOverlap
}

export const VINFAST_READINESS_BOOLEAN_FIELDS: readonly VinfastReadinessFieldDef[] = [
  { key: 'min_two_bays_one_lift', label: '2 bays with one lift', group: 'facility', overlap: 'capacity' },
  { key: 'customer_lounge', label: 'Customer lounge', group: 'facility' },
  { key: 'service_desk_counter', label: 'Service desk / counter', group: 'facility' },
  { key: 'advisor_computers_phones', label: 'Advisor computers & phones', group: 'facility' },
  { key: 'shop_signage', label: 'Shop signage', group: 'facility' },
  { key: 'service_area_power_wifi', label: 'Power & WiFi in service area', group: 'facility' },
  { key: 'hv_safety_equipment', label: 'HV safety equipment', group: 'vinfast_program', overlap: 'above' },
  { key: 'wall_charger_space', label: 'VinFast wall charger space', group: 'vinfast_program' },
  { key: 'spare_parts_area', label: 'Spare parts area', group: 'facility' },
  { key: 'acting_manager', label: 'Acting manager', group: 'staffing' },
  { key: 'vf_trained_technician', label: 'VF-trained technician (≥1)', group: 'vinfast_program' },
  { key: 'vf_customer_ready', label: 'Team ready for VF customers', group: 'vinfast_program' },
  { key: 'vf_stock_inventory_tracking', label: 'VinFast stock tracking', group: 'vinfast_program' },
  { key: 'customer_greeter', label: 'Customer greeter', group: 'staffing' },
] as const

export const VINFAST_READINESS_SCORE_TOTAL = VINFAST_READINESS_BOOLEAN_FIELDS.length

export const VINFAST_READINESS_GROUP_LABELS: Record<VinfastReadinessGroupId, string> = {
  facility: 'Facility',
  vinfast_program: 'VinFast program',
  staffing: 'Staffing',
}

export const VINFAST_READINESS_GROUP_ORDER: readonly VinfastReadinessGroupId[] = [
  'facility',
  'vinfast_program',
  'staffing',
]

export type VinfastReadinessItem = {
  key: VinfastReadinessFieldKey
  label: string
  value: 'yes' | 'no' | null
  overlap?: VinfastReadinessOverlap
  wifiMbps?: number | null
}

export type VinfastReadinessGroup = {
  id: VinfastReadinessGroupId
  label: string
  items: VinfastReadinessItem[]
}

export type FacilitySurveyRow = {
  submitted_at?: string | null
  created_at?: string | null
  responses?: unknown
  shop_name_raw?: string | null
}

export type VinfastReadinessViewModel = {
  groups: VinfastReadinessGroup[]
  yesCount: number
  gapCount: number
  gapLabels: string[]
  wifiMbps: number | null
  notes: string | null
  surveyedAt: Date | null
  ready: boolean
}

function parseYesNo(raw: unknown): 'yes' | 'no' | null {
  if (raw === 'yes' || raw === true) return 'yes'
  if (raw === 'no' || raw === false) return 'no'
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (s === 'yes' || s === 'y') return 'yes'
    if (s === 'no' || s === 'n') return 'no'
  }
  return null
}

function parseWifiMbps(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
  if (typeof raw === 'string') {
    const n = Number.parseInt(raw.trim().replace(/,/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeNoteCompare(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function overlapLabel(overlap: VinfastReadinessOverlap): string {
  return overlap === 'capacity' ? 'shown in Capacity' : 'shown above'
}

export function parseVinfastReadiness(
  survey: FacilitySurveyRow,
  locationName: string,
): VinfastReadinessViewModel {
  const responses =
    survey.responses && typeof survey.responses === 'object' && !Array.isArray(survey.responses)
      ? (survey.responses as Record<string, unknown>)
      : {}

  const wifiMbps = parseWifiMbps(responses.wifi_speed_mbps)

  const items: VinfastReadinessItem[] = VINFAST_READINESS_BOOLEAN_FIELDS.map(def => ({
    key: def.key,
    label: def.label,
    value: parseYesNo(responses[def.key]),
    overlap: def.overlap,
    wifiMbps: def.key === 'service_area_power_wifi' ? wifiMbps : undefined,
  }))

  const yesCount = items.filter(i => i.value === 'yes').length
  const gapLabels = items.filter(i => i.value === 'no').map(i => i.label)
  const gapCount = gapLabels.length

  const rawNotes = typeof responses.notes === 'string' ? responses.notes.trim() : ''
  const shopCompare = normalizeNoteCompare(locationName)
  const notesCompare = normalizeNoteCompare(survey.shop_name_raw ?? locationName)
  const notes =
    rawNotes &&
    normalizeNoteCompare(rawNotes) !== shopCompare &&
    normalizeNoteCompare(rawNotes) !== notesCompare
      ? rawNotes
      : null

  const surveyedRaw = survey.submitted_at ?? survey.created_at ?? null
  const surveyedAt = surveyedRaw ? new Date(surveyedRaw) : null
  const surveyedValid =
    surveyedAt && !Number.isNaN(surveyedAt.getTime()) ? surveyedAt : null

  const groups: VinfastReadinessGroup[] = VINFAST_READINESS_GROUP_ORDER.map(id => ({
    id,
    label: VINFAST_READINESS_GROUP_LABELS[id],
    items: items.filter(item => {
      const def = VINFAST_READINESS_BOOLEAN_FIELDS.find(f => f.key === item.key)
      return def?.group === id
    }),
  }))

  return {
    groups,
    yesCount,
    gapCount,
    gapLabels,
    wifiMbps,
    notes,
    surveyedAt: surveyedValid,
    ready: gapCount === 0 && yesCount === VINFAST_READINESS_SCORE_TOTAL,
  }
}

export function formatVinfastSurveyedDate(date: Date | null): string | null {
  if (!date) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export { overlapLabel }
