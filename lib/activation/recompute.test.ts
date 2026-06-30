import { describe, expect, it, vi } from 'vitest'
import { recomputeStage } from '@/lib/activation/recompute'
import type { ActivationStateRow } from '@/lib/activation/types'

function baseRow() {
  return {
    location_id: 'loc-1',
    card_added_at: null,
    owner_forward_clicked_at: null,
    service_writer_setup_email_sent_at: null,
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
    activation_variant: 'card_required' as const,
    is_high_value: false,
    sms_channel_dead: false,
    qr_scan_count: 0,
    ref_push_1_sent: false,
    dor75_sent: false,
    toolkit_link_clicked_at: null,
    stage: 'invited' as const,
    stage_changed_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }
}

function mockSupabaseForRecompute(input: {
  row: ActivationStateRow
  enrollmentId?: string | null
  updateError?: string | null
}) {
  const shopEventsInsert = vi.fn().mockResolvedValue({ error: null })
  const activationUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(
      input.updateError ? { error: { message: input.updateError } } : { error: null },
    ),
  })
  const enrollmentUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  const enrollmentId = input.enrollmentId === undefined ? 'enr-1' : input.enrollmentId

  return {
    from: vi.fn((table: string) => {
      if (table === 'activation_state') {
        return {
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: input.row, error: null }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: input.row, error: null }),
            }),
          }),
          update: activationUpdate,
        }
      }
      if (table === 'shop_events') {
        return { insert: shopEventsInsert }
      }
      if (table === 'location_program_enrollments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: enrollmentId ? { id: enrollmentId, manual_stage_override: false } : null,
                  error: null,
                }),
              }),
            }),
          }),
          update: enrollmentUpdate,
        }
      }
      throw new Error(`unexpected table ${table}`)
    }),
    _activationUpdate: activationUpdate,
    _shopEventsInsert: shopEventsInsert,
  }
}

describe('recomputeStage', () => {
  it('writes stage and logs stage.changed when derived stage differs', async () => {
    const row = baseRow()
    const supabase = mockSupabaseForRecompute({ row })

    const result = await recomputeStage(supabase as never, 'loc-1', {
      nowMs: Date.parse('2026-06-09T12:00:00.000Z'),
    })

    expect(result).toMatchObject({
      locationId: 'loc-1',
      previousStage: 'invited',
      stage: 'signed_up',
      changed: true,
    })
    expect(supabase._activationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'signed_up', stage_changed_at: expect.any(String) }),
    )
    expect(supabase._shopEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'stage.changed',
        payload: { from: 'invited', to: 'signed_up' },
      }),
    )
  })

  it('does not update when stage is unchanged', async () => {
    const row: ActivationStateRow = {
      ...baseRow(),
      stage: 'signed_up',
    }
    const supabase = mockSupabaseForRecompute({ row })

    const result = await recomputeStage(supabase as never, 'loc-1', {
      nowMs: Date.parse('2026-06-09T12:00:00.000Z'),
    })

    expect(result).toMatchObject({ changed: false, stage: 'signed_up' })
    expect(supabase._activationUpdate).not.toHaveBeenCalled()
    expect(supabase._shopEventsInsert).not.toHaveBeenCalled()
  })

  it('returns null when shop has no expert assist enrollment', async () => {
    const row = baseRow()
    const supabase = mockSupabaseForRecompute({ row, enrollmentId: null })

    const result = await recomputeStage(supabase as never, 'loc-1', {
      nowMs: Date.parse('2026-06-09T12:00:00.000Z'),
    })

    expect(result).toBeNull()
  })
})
