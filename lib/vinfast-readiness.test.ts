import { describe, expect, it } from 'vitest'
import { parseVinfastReadiness, VINFAST_READINESS_SCORE_TOTAL } from '@/lib/vinfast-readiness'

describe('parseVinfastReadiness', () => {
  it('scores 14/14 ready when all booleans are yes', () => {
    const responses = {
      min_two_bays_one_lift: 'yes',
      customer_lounge: 'yes',
      service_desk_counter: 'yes',
      advisor_computers_phones: 'yes',
      shop_signage: 'yes',
      service_area_power_wifi: 'yes',
      wifi_speed_mbps: 150,
      hv_safety_equipment: 'yes',
      wall_charger_space: 'yes',
      spare_parts_area: 'yes',
      acting_manager: 'yes',
      vf_trained_technician: 'yes',
      vf_customer_ready: 'yes',
      vf_stock_inventory_tracking: 'yes',
      customer_greeter: 'yes',
      notes: 'Glendale Collision Center',
    }
    const model = parseVinfastReadiness(
      { responses, submitted_at: '2025-12-17T21:56:00.000Z', shop_name_raw: 'Glendale Collision Center' },
      'Glendale Collision Center',
    )
    expect(model.yesCount).toBe(VINFAST_READINESS_SCORE_TOTAL)
    expect(model.gapCount).toBe(0)
    expect(model.ready).toBe(true)
    expect(model.wifiMbps).toBe(150)
    expect(model.notes).toBeNull()
  })

  it('surfaces gaps and hides echo notes', () => {
    const responses = {
      min_two_bays_one_lift: 'yes',
      customer_lounge: 'yes',
      service_desk_counter: 'yes',
      advisor_computers_phones: 'yes',
      shop_signage: 'yes',
      service_area_power_wifi: 'yes',
      wifi_speed_mbps: 600,
      hv_safety_equipment: 'yes',
      wall_charger_space: 'yes',
      spare_parts_area: 'no',
      acting_manager: 'yes',
      vf_trained_technician: 'yes',
      vf_customer_ready: 'yes',
      vf_stock_inventory_tracking: 'no',
      customer_greeter: 'yes',
      notes: 'L&M Automotive',
    }
    const model = parseVinfastReadiness(
      { responses, shop_name_raw: 'L&M Automotive' },
      'L&M Automotive',
    )
    expect(model.yesCount).toBe(12)
    expect(model.gapCount).toBe(2)
    expect(model.gapLabels).toEqual(['Spare parts area', 'VinFast stock tracking'])
    expect(model.ready).toBe(false)
    expect(model.notes).toBeNull()
  })
})
