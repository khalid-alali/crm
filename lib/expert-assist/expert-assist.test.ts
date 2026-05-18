import { describe, expect, it } from 'vitest'
import { computeConsultBillUsd } from '@/lib/expert-assist/billing'
import { billableSecondsToCharge, computeChargeAmountCents } from '@/lib/expert-assist/billing-charge'
import { normalizeSmsAddress, normalizeShopShortCode } from '@/lib/expert-assist/phone'
import { queueDataSignature } from '@/lib/expert-assist/queue-snapshot'
import {
  activeTimerSeconds,
  formatConsultCaseId,
  formatCreatedTime,
  formatTimerClock,
  formatWaitMinutes,
  getQueueQuestionPreview,
  formatVehicleLabel,
  getQueuePill,
  getTimerVisualState,
  partitionOpenCases,
} from '@/lib/expert-assist/queue-display'
import type { ConsultQueueRow } from '@/lib/expert-assist/types'
import { extractVinFromText, decodeVinNhtsa } from '@/lib/expert-assist/vin-decode'

function row(partial: Partial<ConsultQueueRow> & { id: string }): ConsultQueueRow {
  const { id, ...rest } = partial
  return {
    id,
    status: 'open',
    created_at: partial.created_at ?? '2026-05-17T10:00:00Z',
    originating_phone_number: '+14155550100',
    initial_question: partial.initial_question ?? null,
    shop_id: null,
    vin: null,
    year: null,
    model: null,
    trim: null,
    timer_started_at: null,
    timer_stopped_at: null,
    billable_seconds: null,
    ...rest,
  }
}

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

describe('queue display', () => {
  it('formats stable EA case ids', () => {
    expect(formatConsultCaseId('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toMatch(/^EA-\d{4}$/)
  })

  it('queue signature changes when row data changes', () => {
    const a = row({ id: '1', last_message_at: null })
    const b = row({ id: '1', last_message_at: '2026-05-17T11:00:00Z' })
    expect(queueDataSignature([a], [])).not.toBe(queueDataSignature([b], []))
  })

  it('prefers first inbound for queue question', () => {
    expect(
      getQueueQuestionPreview(
        row({
          id: '1',
          initial_question: 'Intake form text',
          first_inbound_preview: 'Shop SMS: AC not cooling',
        })
      )
    ).toBe('Shop SMS: AC not cooling')
    expect(getQueueQuestionPreview(row({ id: '2', initial_question: 'Intake only' }))).toBe('Intake only')
  })

  it('strips Tesla from vehicle model', () => {
    expect(formatVehicleLabel(row({ id: '1', model: 'Tesla Model 3', year: '2022' }))).toEqual({
      model: 'Model 3',
      year: '2022',
    })
  })

  it('partitions by ball-in-court', () => {
    const need = row({
      id: 'a',
      last_message_direction: 'inbound',
      last_message_at: '2026-05-17T11:00:00Z',
    })
    const wait = row({
      id: 'b',
      last_message_direction: 'outbound',
      last_message_at: '2026-05-17T11:00:00Z',
    })
    const parts = partitionOpenCases([wait, need])
    expect(parts.needResponse.map(r => r.id)).toEqual(['a'])
    expect(parts.awaitingShop.map(r => r.id)).toEqual(['b'])
  })

  it('maps queue pills', () => {
    expect(getQueuePill(row({ id: 'n', last_message_at: null }))).toBe('new')
    expect(
      getQueuePill(
        row({ id: 'r', last_message_direction: 'inbound', last_message_at: '2026-05-17T11:00:00Z' })
      )
    ).toBe('shop_replied')
    expect(
      getQueuePill(
        row({ id: 'w', last_message_direction: 'outbound', last_message_at: '2026-05-17T11:00:00Z' })
      )
    ).toBe('awaiting_shop')
  })

  it('timer visual thresholds', () => {
    expect(getTimerVisualState(null)).toBe('idle')
    expect(getTimerVisualState(17 * 60)).toBe('running')
    expect(getTimerVisualState(18 * 60)).toBe('warn')
    expect(getTimerVisualState(60 * 60)).toBe('danger')
  })

  it('active timer seconds when running', () => {
    const started = new Date('2026-05-17T10:00:00Z').toISOString()
    const secs = activeTimerSeconds(
      row({ id: 't', timer_started_at: started, timer_stopped_at: null }),
      new Date('2026-05-17T10:18:42Z').getTime()
    )
    expect(secs).toBe(18 * 60 + 42)
  })

  it('formats waiting as m, h, or d', () => {
    const anchor = '2026-05-17T10:00:00Z'
    expect(formatWaitMinutes(anchor, new Date('2026-05-17T10:29:00Z').getTime())).toBe('29m')
    expect(formatWaitMinutes(anchor, new Date('2026-05-17T12:15:00Z').getTime())).toBe('2h 15m')
    expect(formatWaitMinutes(anchor, new Date('2026-05-17T12:00:00Z').getTime())).toBe('2h')
    expect(formatWaitMinutes(anchor, new Date('2026-05-18T11:00:00Z').getTime())).toBe('1d')
  })

  it('formats created as time today or date when older', () => {
    const noon = new Date(2026, 4, 17, 14, 52, 0)
    const createdToday = new Date(2026, 4, 17, 14, 52, 0).toISOString()
    const createdOlder = new Date(2026, 4, 14, 9, 0, 0).toISOString()
    expect(formatCreatedTime(createdToday, noon.getTime())).toMatch(/2:52/)
    expect(formatCreatedTime(createdOlder, noon.getTime())).toBe('May 14')
  })

  it('formats timer as MM:SS or H:MM:SS', () => {
    expect(formatTimerClock(7 * 60 + 15)).toBe('07:15')
    expect(formatTimerClock(18 * 60 + 42)).toBe('18:42')
    expect(formatTimerClock(3600 + 5 * 60 + 3)).toBe('1:05:03')
  })
})
