import { describe, expect, it } from 'vitest'
import { deriveExpertAssistNextAction } from '@/lib/expert-assist-funnel/next-action'

describe('deriveExpertAssistNextAction', () => {
  it('prioritizes incomplete checklist items', () => {
    expect(
      deriveExpertAssistNextAction({
        stage: 'signed_up',
        signupComplete: true,
        hasInboundSms: false,
        closedConsultCount: 0,
        checklist: [
          { itemKey: 'card_on_file', label: 'Card on file', completedAt: '2026-01-01' },
          {
            itemKey: 'service_writer_setup_email_sent',
            label: 'Service writer setup email sent',
            completedAt: null,
          },
        ],
      }),
    ).toBe('Service writer setup email sent')
  })

  it('suggests first consult after activation checklist is done', () => {
    expect(
      deriveExpertAssistNextAction({
        stage: 'engaged',
        signupComplete: true,
        hasInboundSms: true,
        closedConsultCount: 0,
        checklist: [
          { itemKey: 'card_on_file', label: 'Card on file', completedAt: '2026-01-01' },
          {
            itemKey: 'service_writer_setup_email_sent',
            label: 'Service writer setup email sent',
            completedAt: '2026-01-02',
          },
        ],
      }),
    ).toBe('Complete first consult')
  })
})
