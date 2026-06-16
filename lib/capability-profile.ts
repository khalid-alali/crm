export const ELIGIBILITY_VALUES = ['tesla_ev', 'tesla', 'ev', 'none'] as const
export const DEPTH_VALUES = ['light', 'heavy'] as const
export const HV_DEPTH_VALUES = ['light', 'heavy', 'heavy_plus'] as const

export type EligibilityValue = (typeof ELIGIBILITY_VALUES)[number]
export type DepthValue = (typeof DEPTH_VALUES)[number]
export type HvDepthValue = (typeof HV_DEPTH_VALUES)[number]
export type AdasDepthValue = DepthValue

export type CapabilityProfileField =
  | 'eligibility'
  | 'auto_depth'
  | 'lv_depth'
  | 'hv_depth'
  | 'adas_depth'

export type CapabilityProfileState = {
  eligibility: EligibilityValue | null
  auto_depth: DepthValue | null
  lv_depth: DepthValue | null
  hv_depth: HvDepthValue | null
  adas_depth: AdasDepthValue | null
  profile_set_by: string | null
  profile_set_at: string | null
}

export const CAPABILITY_PROFILE_FIELDS: CapabilityProfileField[] = [
  'eligibility',
  'auto_depth',
  'lv_depth',
  'hv_depth',
  'adas_depth',
]

export const ELIGIBILITY_OPTIONS: { value: EligibilityValue; label: string }[] = [
  { value: 'tesla_ev', label: 'Tesla + EV ready' },
  { value: 'tesla', label: 'Tesla ready' },
  { value: 'ev', label: 'EV ready' },
  { value: 'none', label: 'No EVs' },
]

export const DEPTH_OPTIONS: { value: DepthValue; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'heavy', label: 'Heavy' },
]

export const HV_DEPTH_OPTIONS: { value: HvDepthValue; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'heavy_plus', label: 'Heavy+' },
]

export type CapabilityProfileDimension = {
  field: CapabilityProfileField
  label: string
  subLabel: string
  ariaLabel: string
  variant: 'neutral' | 'violet'
  options: { value: string; label: string }[]
}

export const CAPABILITY_PROFILE_DIMENSIONS: CapabilityProfileDimension[] = [
  {
    field: 'eligibility',
    label: 'Eligibility',
    subLabel: 'What can route here',
    ariaLabel: 'Eligibility',
    variant: 'violet',
    options: ELIGIBILITY_OPTIONS,
  },
  {
    field: 'auto_depth',
    label: 'Auto',
    subLabel: 'General mechanical',
    ariaLabel: 'Auto depth',
    variant: 'neutral',
    options: DEPTH_OPTIONS,
  },
  {
    field: 'lv_depth',
    label: 'Low voltage',
    subLabel: '12V electrical',
    ariaLabel: 'Low voltage depth',
    variant: 'neutral',
    options: DEPTH_OPTIONS,
  },
  {
    field: 'hv_depth',
    label: 'High voltage',
    subLabel: 'EV traction system',
    ariaLabel: 'High voltage depth',
    variant: 'violet',
    options: HV_DEPTH_OPTIONS,
  },
  {
    field: 'adas_depth',
    label: 'ADAS',
    subLabel: 'Calibration',
    ariaLabel: 'ADAS depth',
    variant: 'neutral',
    options: DEPTH_OPTIONS,
  },
]

const FIELD_VALUE_SETS: Record<CapabilityProfileField, readonly string[]> = {
  eligibility: ELIGIBILITY_VALUES,
  auto_depth: DEPTH_VALUES,
  lv_depth: DEPTH_VALUES,
  hv_depth: HV_DEPTH_VALUES,
  adas_depth: DEPTH_VALUES,
}

export function isCapabilityProfileField(key: string): key is CapabilityProfileField {
  return (CAPABILITY_PROFILE_FIELDS as readonly string[]).includes(key)
}

export function isValidCapabilityProfileValue(
  field: CapabilityProfileField,
  value: unknown,
): value is string {
  return typeof value === 'string' && FIELD_VALUE_SETS[field].includes(value)
}

export function pickCapabilityProfileState(row: Record<string, unknown>): CapabilityProfileState {
  const eligibility = isValidCapabilityProfileValue('eligibility', row.eligibility)
    ? (row.eligibility as EligibilityValue)
    : null
  const auto_depth = isValidCapabilityProfileValue('auto_depth', row.auto_depth)
    ? (row.auto_depth as DepthValue)
    : null
  const lv_depth = isValidCapabilityProfileValue('lv_depth', row.lv_depth)
    ? (row.lv_depth as DepthValue)
    : null
  const hv_depth = isValidCapabilityProfileValue('hv_depth', row.hv_depth)
    ? (row.hv_depth as HvDepthValue)
    : null
  const adas_depth = isValidCapabilityProfileValue('adas_depth', row.adas_depth)
    ? (row.adas_depth as AdasDepthValue)
    : null

  return {
    eligibility,
    auto_depth,
    lv_depth,
    hv_depth,
    adas_depth,
    profile_set_by: typeof row.profile_set_by === 'string' ? row.profile_set_by : null,
    profile_set_at: typeof row.profile_set_at === 'string' ? row.profile_set_at : null,
  }
}
