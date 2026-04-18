import { validatePortalHoursModel, type PortalHoursModel } from '@/lib/portal-hours-schedule'
import { validatePortalEmail, validateUsPhoneOptional, stripPhoneToNationalDigits } from '@/lib/portal-phone-email'

export type PortalCapabilitiesFieldKey =
  | 'shop_name'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'bar_license_number'
  | 'hours_of_operation'
  | 'standard_warranty'
  | 'total_techs'
  | 'allocated_techs'
  | 'daily_appointment_capacity'
  | 'weekly_appointment_capacity'
  | 'parking_spots_rw'
  | 'two_post_lifts'
  | 'afterhours_tow_ins'
  | 'night_drops'
  | 'tires'
  | 'wheel_alignment'
  | 'body_work'
  | 'adas'
  | 'ac_work'
  | 'forklift'
  | 'hv_battery_table'
  | 'windshields'

export type PortalCapabilitiesFormValues = {
  isCA: boolean
  shopName: string
  contactName: string
  contactEmail: string
  contactPhoneDigits: string
  barLicenseDigits: string
  hoursModel: PortalHoursModel
  standardWarranty: string
  totalTechs: string
  allocatedTechs: string
  dailyCap: string
  weeklyCap: string
  parking: string
  lifts: string
  afterhours_tow_ins: string
  night_drops: string
  tires: string
  wheel_alignment: string
  body_work: string
  adas: string
  ac_work: string
  forklift: string
  hv_battery_table: string
  windshields: string
}

/** Shared caps for portal int fields (autosave + full form). */
export const PORTAL_INT_MAX = {
  total_techs: 50,
  allocated_techs: 50,
  daily_appointment_capacity: 50,
  weekly_appointment_capacity: 100,
  parking_spots_rw: 200,
  two_post_lifts: 50,
} as const

export function parseBoundedNonNegInt(raw: string, max: number): number | null {
  const t = raw.trim()
  if (t === '') return null
  if (!/^\d+$/.test(t)) return null
  const n = parseInt(t, 10)
  if (Number.isNaN(n) || n < 0 || n > max) return null
  return n
}

function intFieldError(key: keyof typeof PORTAL_INT_MAX, raw: string): string | null {
  const max = PORTAL_INT_MAX[key]
  if (!raw.trim()) return 'This field is required'
  const n = parseBoundedNonNegInt(raw, max)
  if (n === null) return `Enter a whole number from 0 to ${max}`
  return null
}

function requireChoice(label: string, v: string): string | null {
  if (!v) return `${label} is required`
  return null
}

export function validateBarLicense(isCA: boolean, digits: string): string | null {
  if (!isCA) return null
  if (digits.length < 6 || digits.length > 8) return 'BAR number must be 6–8 digits'
  return null
}

export function validatePortalCapabilitiesForm(
  v: PortalCapabilitiesFormValues,
): { errors: Partial<Record<PortalCapabilitiesFieldKey, string>>; firstKey?: PortalCapabilitiesFieldKey } {
  const errors: Partial<Record<PortalCapabilitiesFieldKey, string>> = {}

  if (!v.shopName.trim()) errors.shop_name = 'Shop name is required'
  if (!v.contactName.trim()) errors.contact_name = 'Contact name is required'

  const em = validatePortalEmail(v.contactEmail)
  if (em) errors.contact_email = em

  const ph = validateUsPhoneOptional(v.contactPhoneDigits)
  if (ph) errors.contact_phone = ph

  if (v.isCA) {
    const bar = validateBarLicense(true, v.barLicenseDigits)
    if (bar) errors.bar_license_number = bar
  }

  const he = validatePortalHoursModel(v.hoursModel)
  if (he) errors.hours_of_operation = he

  if (!v.standardWarranty.trim()) errors.standard_warranty = 'Standard warranty is required'

  const te = intFieldError('total_techs', v.totalTechs)
  if (te) errors.total_techs = te
  const ae = intFieldError('allocated_techs', v.allocatedTechs)
  if (ae) errors.allocated_techs = ae
  const de = intFieldError('daily_appointment_capacity', v.dailyCap)
  if (de) errors.daily_appointment_capacity = de
  const we = intFieldError('weekly_appointment_capacity', v.weeklyCap)
  if (we) errors.weekly_appointment_capacity = we
  const pe = intFieldError('parking_spots_rw', v.parking)
  if (pe) errors.parking_spots_rw = pe
  const le = intFieldError('two_post_lifts', v.lifts)
  if (le) errors.two_post_lifts = le

  const tot = parseBoundedNonNegInt(v.totalTechs, PORTAL_INT_MAX.total_techs)
  const alc = parseBoundedNonNegInt(v.allocatedTechs, PORTAL_INT_MAX.allocated_techs)
  if (tot !== null && alc !== null && alc > tot) {
    errors.allocated_techs = "Can't exceed total techs"
  }

  const c1 = requireChoice('After-hours tow-ins', v.afterhours_tow_ins)
  if (c1) errors.afterhours_tow_ins = c1
  const c2 = requireChoice('Night drops', v.night_drops)
  if (c2) errors.night_drops = c2
  const c3 = requireChoice('Tires capability', v.tires)
  if (c3) errors.tires = c3
  const c4 = requireChoice('Wheel alignment', v.wheel_alignment)
  if (c4) errors.wheel_alignment = c4
  const c5 = requireChoice('Body work', v.body_work)
  if (c5) errors.body_work = c5
  const c6 = requireChoice('ADAS calibrations', v.adas)
  if (c6) errors.adas = c6
  const c7 = requireChoice('A/C work', v.ac_work)
  if (c7) errors.ac_work = c7
  const c8 = requireChoice('Forklift', v.forklift)
  if (c8) errors.forklift = c8
  const c9 = requireChoice('HV battery / scissor table', v.hv_battery_table)
  if (c9) errors.hv_battery_table = c9
  const c10 = requireChoice('Windshield replacement', v.windshields)
  if (c10) errors.windshields = c10

  const order: PortalCapabilitiesFieldKey[] = [
    'shop_name',
    'contact_name',
    'contact_email',
    'contact_phone',
    'bar_license_number',
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
    'hours_of_operation',
  ]

  const firstKey = order.find(k => errors[k])
  return { errors, firstKey }
}

export function isPortalCapabilitiesFormComplete(v: PortalCapabilitiesFormValues): boolean {
  return Object.keys(validatePortalCapabilitiesForm(v).errors).length === 0
}

export function barLicenseDigitsOnly(input: string): string {
  return input.replace(/\D/g, '').slice(0, 8)
}

export { stripPhoneToNationalDigits }
