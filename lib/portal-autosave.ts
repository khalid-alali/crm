import {
  AC_VALUES,
  ALIGNMENT_VALUES,
  isMember,
  isYesNo,
  THREE_TIER,
  TIRES_VALUES,
  YES_NO,
} from '@/lib/portal-capabilities-schema'
import { validatePortalEmail, validateUsPhoneOptional, stripPhoneToNationalDigits } from '@/lib/portal-phone-email'
import { tryParsePortalHoursJson, validatePortalHoursModel } from '@/lib/portal-hours-schedule'
import {
  PORTAL_INT_MAX,
  allocatedPatchToInt,
  parseBoundedNonNegInt,
} from '@/lib/portal-capabilities-form'

/** Client/API keys for PATCH body.patch (camelCase). */
export const PORTAL_AUTOSAVE_LOCATION_KEYS = [
  'shop_name',
  'bar_license_number',
  'hours_of_operation',
  'standard_warranty',
  'total_techs',
  'allocated_techs',
  'daily_appointment_capacity',
  'weekly_appointment_capacity',
  'parking_spots_rw',
  'two_post_lifts',
  'afterhours_tow_ins',
  'night_drops',
  'tires',
  'wheel_alignment',
  'body_work',
  'adas',
  'ac_work',
  'forklift',
  'hv_battery_table',
  'windshields',
] as const

export const PORTAL_AUTOSAVE_CONTACT_KEYS = ['contact_name', 'contact_email', 'contact_phone'] as const

export type PortalAutosaveLocationKey = (typeof PORTAL_AUTOSAVE_LOCATION_KEYS)[number]
export type PortalAutosaveContactKey = (typeof PORTAL_AUTOSAVE_CONTACT_KEYS)[number]
export type PortalAutosaveKey = PortalAutosaveLocationKey | PortalAutosaveContactKey

const LOCATION_COLUMN: Record<PortalAutosaveLocationKey, string> = {
  shop_name: 'name',
  bar_license_number: 'bar_license_number',
  hours_of_operation: 'hours_of_operation',
  standard_warranty: 'standard_warranty',
  total_techs: 'total_techs',
  allocated_techs: 'allocated_techs',
  daily_appointment_capacity: 'daily_appointment_capacity',
  weekly_appointment_capacity: 'weekly_appointment_capacity',
  parking_spots_rw: 'capabilities_parking_spots_rw',
  two_post_lifts: 'capabilities_two_post_lifts',
  afterhours_tow_ins: 'capabilities_afterhours_tow_ins',
  night_drops: 'capabilities_night_drops',
  tires: 'capabilities_tires',
  wheel_alignment: 'capabilities_wheel_alignment',
  body_work: 'capabilities_body_work',
  adas: 'capabilities_adas',
  ac_work: 'capabilities_ac_work',
  forklift: 'capabilities_forklift',
  hv_battery_table: 'capabilities_hv_battery_table',
  windshields: 'capabilities_windshields',
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export type PortalAutosaveCtx = {
  isCA: boolean
  /** Current form values for cross-field checks (allocated vs total). */
  totalTechsInput?: string
  allocatedTechsInput?: string
}

/** Validate one autosave field; returns error message or null if OK. */
export function validatePortalAutosaveField(
  key: PortalAutosaveKey,
  value: unknown,
  ctx: PortalAutosaveCtx,
): string | null {
  switch (key) {
    case 'shop_name':
      if (!str(value)) return 'Shop name is required'
      return null
    case 'contact_name':
      if (!str(value)) return 'Contact name is required'
      return null
    case 'contact_email':
      return validatePortalEmail(str(value))
    case 'contact_phone': {
      const digits = stripPhoneToNationalDigits(str(value))
      return validateUsPhoneOptional(digits)
    }
    case 'bar_license_number': {
      if (!ctx.isCA) return null
      const d = str(value).replace(/\D/g, '')
      if (!d) return 'BAR license is required for CA'
      if (d.length < 6 || d.length > 8) return 'BAR number must be 6–8 digits'
      return null
    }
    case 'hours_of_operation': {
      const s = str(value)
      if (!s) return 'Hours are required'
      const m = tryParsePortalHoursJson(s)
      if (m) return validatePortalHoursModel(m)
      return null
    }
    case 'standard_warranty':
      return null
    case 'total_techs': {
      const max = PORTAL_INT_MAX.total_techs
      const n = parseBoundedNonNegInt(typeof value === 'string' ? value : String(value ?? ''), max)
      if (n === null) return `Must be a whole number from 0 to ${max}`
      const alcRaw = ctx.allocatedTechsInput ?? ''
      const alc = alcRaw.trim() !== '' ? allocatedPatchToInt(alcRaw.trim()) : null
      if (alc !== null && alc > n) return "Can't be less than allocated techs"
      return null
    }
    case 'allocated_techs': {
      const n = allocatedPatchToInt(value)
      if (n === null) return 'Invalid allocation choice'
      const totRaw = ctx.totalTechsInput ?? ''
      const tot = parseBoundedNonNegInt(totRaw.trim(), PORTAL_INT_MAX.total_techs)
      if (tot !== null && n > tot) return "Can't exceed total techs"
      return null
    }
    case 'daily_appointment_capacity': {
      const max = PORTAL_INT_MAX.daily_appointment_capacity
      const n = parseBoundedNonNegInt(typeof value === 'string' ? value : String(value ?? ''), max)
      if (n === null) return `Must be a whole number from 0 to ${max}`
      return null
    }
    case 'weekly_appointment_capacity': {
      const max = PORTAL_INT_MAX.weekly_appointment_capacity
      const n = parseBoundedNonNegInt(typeof value === 'string' ? value : String(value ?? ''), max)
      if (n === null) return `Must be a whole number from 0 to ${max}`
      return null
    }
    case 'parking_spots_rw': {
      const max = PORTAL_INT_MAX.parking_spots_rw
      const n = parseBoundedNonNegInt(typeof value === 'string' ? value : String(value ?? ''), max)
      if (n === null) return `Must be a whole number from 0 to ${max}`
      return null
    }
    case 'two_post_lifts': {
      const max = PORTAL_INT_MAX.two_post_lifts
      const n = parseBoundedNonNegInt(typeof value === 'string' ? value : String(value ?? ''), max)
      if (n === null) return `Must be a whole number from 0 to ${max}`
      return null
    }
    case 'afterhours_tow_ins':
    case 'night_drops':
    case 'forklift':
    case 'hv_battery_table':
      if (!isYesNo(str(value) || undefined)) return 'Invalid choice'
      return null
    case 'tires':
      if (!isMember(str(value) || undefined, TIRES_VALUES)) return 'Invalid choice'
      return null
    case 'wheel_alignment':
    case 'body_work':
    case 'adas':
    case 'windshields':
      if (!isMember(str(value) || undefined, THREE_TIER)) return 'Invalid choice'
      return null
    case 'ac_work':
      if (!isMember(str(value) || undefined, AC_VALUES)) return 'Invalid choice'
      return null
    default:
      return 'Unknown field'
  }
}

export function locationColumnForAutosaveKey(key: PortalAutosaveLocationKey): string {
  return LOCATION_COLUMN[key]
}

export function isPortalAutosaveLocationKey(k: string): k is PortalAutosaveLocationKey {
  return (PORTAL_AUTOSAVE_LOCATION_KEYS as readonly string[]).includes(k)
}

export function isPortalAutosaveContactKey(k: string): k is PortalAutosaveContactKey {
  return (PORTAL_AUTOSAVE_CONTACT_KEYS as readonly string[]).includes(k)
}
