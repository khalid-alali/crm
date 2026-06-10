import { describe, expect, it } from 'vitest'
import { cardLabelForStatus, isTokenActionable } from '@/lib/labor-rate-approval/row'
import type { LaborRateApprovalRow } from '@/lib/labor-rate-approval/types'

function row(partial: Partial<LaborRateApprovalRow>): LaborRateApprovalRow {
  return {
    id: 'id',
    location_id: 'loc',
    warranty_rate: 95,
    charge_rate: 120,
    status: 'requested',
    submitted_by_email: 'dave@repairwise.com',
    submitted_at: '2026-06-02T18:00:00.000Z',
    sla_due_at: '2026-06-09T18:00:00.000Z',
    decided_at: null,
    decided_by_name: null,
    decision_reason: null,
    escalated_at: null,
    decision_token: 'tok',
    token_used_at: null,
    email_thread_message_id: null,
    created_at: '2026-06-02T18:00:00.000Z',
    updated_at: '2026-06-02T18:00:00.000Z',
    ...partial,
  }
}

describe('isTokenActionable', () => {
  it('allows requested with unused token', () => {
    expect(isTokenActionable(row({ status: 'requested' }))).toBe(true)
  })

  it('rejects after token is used', () => {
    expect(isTokenActionable(row({ token_used_at: '2026-06-03T00:00:00.000Z' }))).toBe(false)
  })

  it('rejects approved status', () => {
    expect(isTokenActionable(row({ status: 'approved' }))).toBe(false)
  })
})

describe('cardLabelForStatus', () => {
  it('labels requested with date', () => {
    const label = cardLabelForStatus(
      row({ status: 'requested', updated_at: '2026-06-02T18:00:00.000Z' }),
    )
    expect(label).toMatch(/^Requested Jun/)
  })
})
