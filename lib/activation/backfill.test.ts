import { describe, expect, it } from 'vitest'
import {
  buildActivationSeed,
  buildClosedConsultFacts,
  buildFirstInboundAt,
  inferActivationVariant,
  type BackfillChecklistRow,
  type BackfillClosedCaseRow,
  type BackfillEnrollmentRow,
  type BackfillInboundMessageRow,
  type BackfillLocationRow,
} from '@/lib/activation/backfill'

const NOW = Date.parse('2026-06-10T12:00:00.000Z')

function location(overrides: Partial<BackfillLocationRow> = {}): BackfillLocationRow {
  return {
    id: 'loc-1',
    consult_enabled: true,
    consult_billing_status: 'active',
    consult_first_free_used_at: null,
    consult_stripe_payment_method_id: 'pm_123',
    toolbox_case_partner: 'OILCHANGERSD0D9',
    consult_invited_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function enrollment(overrides: Partial<BackfillEnrollmentRow> = {}): BackfillEnrollmentRow {
  return {
    id: 'enr-1',
    location_id: 'loc-1',
    created_at: '2026-05-15T00:00:00.000Z',
    stage: 'signed_up',
    ...overrides,
  }
}

function checklist(items: Omit<BackfillChecklistRow, 'enrollment_id'>[]): BackfillChecklistRow[] {
  return items.map(item => ({ enrollment_id: 'enr-1', ...item }))
}

describe('inferActivationVariant', () => {
  it('uses card_required when Stripe PM exists', () => {
    expect(inferActivationVariant(location())).toBe('card_required')
  })

  it('uses card_after_first_consult for enabled shops without card and not_setup billing', () => {
    expect(
      inferActivationVariant(
        location({
          consult_stripe_payment_method_id: null,
          consult_billing_status: 'not_setup',
        }),
      ),
    ).toBe('card_after_first_consult')
  })
})

describe('buildClosedConsultFacts', () => {
  it('sorts closed consult timestamps', () => {
    const rows: BackfillClosedCaseRow[] = [
      { shop_id: 'loc-1', closed_at: '2026-06-02T00:00:00.000Z' },
      { shop_id: 'loc-1', closed_at: '2026-05-20T00:00:00.000Z' },
    ]
    expect(buildClosedConsultFacts(rows)).toEqual({
      consult_count: 2,
      first_consult_at: '2026-05-20T00:00:00.000Z',
      last_consult_at: '2026-06-02T00:00:00.000Z',
    })
  })
})

describe('buildFirstInboundAt', () => {
  it('returns earliest inbound message timestamp', () => {
    const rows: BackfillInboundMessageRow[] = [
      { shop_id: 'loc-1', created_at: '2026-05-22T00:00:00.000Z' },
      { shop_id: 'loc-1', created_at: '2026-05-18T00:00:00.000Z' },
    ]
    expect(buildFirstInboundAt(rows)).toBe('2026-05-18T00:00:00.000Z')
  })
})

describe('buildActivationSeed', () => {
  it('seeds invited shop with no signup', () => {
    const seed = buildActivationSeed({
      location: location({ consult_enabled: false, consult_billing_status: 'not_setup' }),
      enrollment: enrollment(),
      checklistRows: [],
      closedCases: [],
      inboundMessages: [],
      nowMs: NOW,
    })

    expect(seed.signed_up_at).toBeNull()
    expect(seed.stage).toBe('invited')
    expect(seed.activation_variant).toBe('card_required')
  })

  it('seeds engaged shop from inbound SMS without closed consults', () => {
    const seed = buildActivationSeed({
      location: location(),
      enrollment: enrollment(),
      checklistRows: checklist([
        { item_key: 'front_desk_sms_delivered', completed_at: '2026-05-16T00:00:00.000Z' },
      ]),
      closedCases: [],
      inboundMessages: [{ shop_id: 'loc-1', created_at: '2026-05-20T00:00:00.000Z' }],
      nowMs: NOW,
    })

    expect(seed.signed_up_at).toBe('2026-05-15T00:00:00.000Z')
    expect(seed.first_inbound_at).toBe('2026-05-20T00:00:00.000Z')
    expect(seed.front_desk_sms_delivered_at).toBe('2026-05-16T00:00:00.000Z')
    expect(seed.card_added_at).toBe('2026-05-15T00:00:00.000Z')
    expect(seed.stage).toBe('engaged')
  })

  it('seeds activated shop from one closed consult and checklist timestamps', () => {
    const seed = buildActivationSeed({
      location: location({ consult_first_free_used_at: '2026-05-25T00:00:00.000Z' }),
      enrollment: enrollment(),
      checklistRows: checklist([
        { item_key: 'owner_forward_clicked', completed_at: '2026-05-17T00:00:00.000Z' },
        { item_key: 'qr_scanned', completed_at: '2026-05-19T00:00:00.000Z' },
        { item_key: 'free_consult_used', completed_at: '2026-05-25T00:00:00.000Z' },
      ]),
      closedCases: [{ shop_id: 'loc-1', closed_at: '2026-05-25T00:00:00.000Z' }],
      inboundMessages: [],
      nowMs: NOW,
    })

    expect(seed.consult_count).toBe(1)
    expect(seed.free_consult_used_at).toBe('2026-05-25T00:00:00.000Z')
    expect(seed.qr_first_scanned_at).toBe('2026-05-19T00:00:00.000Z')
    expect(seed.qr_scan_count).toBe(1)
    expect(seed.stage).toBe('activated')
  })

  it('seeds active shop when two consults fall within 60 days', () => {
    const seed = buildActivationSeed({
      location: location(),
      enrollment: enrollment(),
      checklistRows: [],
      closedCases: [
        { shop_id: 'loc-1', closed_at: '2026-04-15T00:00:00.000Z' },
        { shop_id: 'loc-1', closed_at: '2026-05-20T00:00:00.000Z' },
      ],
      inboundMessages: [],
      nowMs: NOW,
    })

    expect(seed.consult_count).toBe(2)
    expect(seed.stage).toBe('active')
  })

  it('seeds dormant shop when last consult is older than 60 days', () => {
    const seed = buildActivationSeed({
      location: location(),
      enrollment: enrollment(),
      checklistRows: [],
      closedCases: [{ shop_id: 'loc-1', closed_at: '2026-01-01T00:00:00.000Z' }],
      inboundMessages: [],
      nowMs: NOW,
    })

    expect(seed.stage).toBe('dormant')
  })
})
