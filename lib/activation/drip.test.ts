import { describe, expect, it } from 'vitest'
import { dripDone, sendOwnerEmailByGap } from '@/lib/activation/drip'
import type { ActivationStateView } from '@/lib/activation/types'

function view(partial: Partial<ActivationStateView>): ActivationStateView {
  return {
    location_id: 'loc-1',
    locationId: 'loc-1',
    card_added_at: null,
    owner_forward_clicked_at: null,
    front_desk_sms_delivered_at: null,
    counter_card_downloaded_at: null,
    welcome_kit_shipped_at: null,
    printout_photo_received_at: null,
    qr_first_scanned_at: null,
    free_consult_used_at: null,
    signed_up_at: '2026-06-01T00:00:00.000Z',
    first_inbound_at: null,
    first_consult_at: null,
    last_consult_at: null,
    consult_count: 0,
    first_referral_at: null,
    referral_count: 0,
    last_referral_at: null,
    activation_variant: 'card_after_first_consult',
    is_high_value: false,
    sms_channel_dead: false,
    qr_scan_count: 0,
    stage: 'signed_up',
    stage_changed_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    shopName: 'Test Shop',
    ownerEmail: 'owner@test.com',
    ownerName: 'Owner',
    frontDeskPhone: '+15551234567',
    toolboxCasePartner: 'TESTSHOP1234',
    ...partial,
  }
}

describe('dripDone', () => {
  it('returns first_inbound when inbound fact is set', () => {
    expect(
      dripDone({
        signed_up_at: '2026-06-01T00:00:00.000Z',
        first_inbound_at: '2026-06-02T00:00:00.000Z',
      }),
    ).toBe('first_inbound')
  })

  it('returns disabled when not signed up', () => {
    expect(
      dripDone({
        signed_up_at: null,
        first_inbound_at: null,
      }),
    ).toBe('disabled')
  })

  it('returns false while drip is still running', () => {
    expect(
      dripDone({
        signed_up_at: '2026-06-01T00:00:00.000Z',
        first_inbound_at: null,
      }),
    ).toBe(false)
  })
})

describe('sendOwnerEmailByGap', () => {
  it('prioritizes forward CTA then counter card then economics', () => {
    expect(sendOwnerEmailByGap(view({}))).toBe('forward_cta')
    expect(
      sendOwnerEmailByGap(
        view({ owner_forward_clicked_at: '2026-06-02T00:00:00.000Z' }),
      ),
    ).toBe('counter_card')
    expect(
      sendOwnerEmailByGap(
        view({
          owner_forward_clicked_at: '2026-06-02T00:00:00.000Z',
          counter_card_downloaded_at: '2026-06-03T00:00:00.000Z',
        }),
      ),
    ).toBe('economics')
  })
})
