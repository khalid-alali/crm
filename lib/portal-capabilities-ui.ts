export type RadioOpt = { value: string; label: string }

export const YES_NO_OPTIONS: RadioOpt[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

export const TIRES_OPTIONS: RadioOpt[] = [
  { value: 'machine_balancer', label: 'Yes, I have a tire machine and balancer in my shop' },
  { value: 'sublet', label: 'Yes, I have a sublet that can RR/balance tires for me' },
  { value: 'no', label: 'No' },
]

/** Wheel alignment — full wording from spec */
export const ALIGNMENT_OPTIONS: RadioOpt[] = [
  { value: 'in_shop', label: 'Yes, I have an alignment rack in my shop' },
  { value: 'sublet', label: 'Yes, I have a sublet that can perform alignments for me' },
  { value: 'no', label: 'No' },
]

export const BODY_WORK_OPTIONS: RadioOpt[] = [
  { value: 'in_shop', label: 'Yes, I perform body work in my shop' },
  { value: 'sublet', label: 'Yes, I have a sublet that can perform body work for me' },
  { value: 'no', label: 'No' },
]

export const ADAS_OPTIONS: RadioOpt[] = [
  { value: 'in_shop', label: 'Yes, I can perform ADAS calibrations in my shop' },
  { value: 'sublet', label: 'Yes, I have a sublet that can perform ADAS calibrations for me' },
  { value: 'no', label: 'No' },
]

export const AC_OPTIONS: RadioOpt[] = [
  { value: 'r134a', label: 'Yes, but only R-134A' },
  { value: 'r1234yf', label: 'Yes, but only R-1234YF' },
  { value: 'both', label: 'Yes, I can handle both R-134A and R-1234YF' },
  { value: 'no', label: 'No' },
]

export const WINDSHIELD_OPTIONS: RadioOpt[] = [
  { value: 'in_shop', label: 'Yes, I can replace windshields in my shop' },
  { value: 'sublet', label: 'Yes, I have a sublet that can replace windshields for me' },
  { value: 'no', label: 'No' },
]
