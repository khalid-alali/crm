import { describe, expect, it } from 'vitest'
import { computeConsultBillUsd } from '@/lib/expert-assist/billing'
import { billableSecondsToCharge, computeChargeAmountCents } from '@/lib/expert-assist/billing-charge'
import { normalizeSmsAddress, normalizeShopShortCode } from '@/lib/expert-assist/phone'
import { extractVinFromText, decodeVinNhtsa } from '@/lib/expert-assist/vin-decode'

describe('computeConsultBillUsd', () => {
  it('flat $60 through 20 minutes', () => {
    expect(computeConsultBillUsd(0).cents).toBe(0)
    expect(computeConsultBillUsd(60).cents).toBe(6000)
    expect(computeConsultBillUsd(1200).cents).toBe(6000)
  })

  it('adds $2.50 per minute after 20 min (ceil)', () => {
    expect(computeConsultBillUsd(1201).cents).toBe(6250)
    expect(computeConsultBillUsd(1260).cents).toBe(6250)
    expect(computeConsultBillUsd(1261).cents).toBe(6500)
  })
})

describe('billableSecondsToCharge + computeChargeAmountCents', () => {
  it('uses override when provided', () => {
    expect(billableSecondsToCharge(100, 1200)).toBe(1200)
    expect(computeChargeAmountCents(1200)).toBe(6000)
  })
})

describe('phone + short code', () => {
  it('normalizes US numbers', () => {
    expect(normalizeSmsAddress('4155550100')).toBe('+14155550100')
    expect(normalizeSmsAddress('+1 (415) 555-0100')).toBe('+14155550100')
  })

  it('normalizes shop codes', () => {
    expect(normalizeShopShortCode(' west-side ')).toBe('WESTSIDE')
  })
})

describe('extractVinFromText', () => {
  it('finds 17-char VIN', () => {
    expect(extractVinFromText('hey 5YJ3E1EA1KF123456 thanks')).toBe('5YJ3E1EA1KF123456')
  })
})
