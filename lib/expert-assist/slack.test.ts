import { describe, expect, it } from 'vitest'
import {
  buildExpertAssistSlackMessage,
  crmConsultUrl,
  formatConsultSource,
} from '@/lib/expert-assist/slack'

const CASE_ID = 'ceb7a25d-0136-48b2-951e-a69fe93322c4'

describe('formatConsultSource', () => {
  it('maps known intake sources', () => {
    expect(formatConsultSource('surfaces_web')).toBe('Web')
    expect(formatConsultSource('web_intake')).toBe('Web intake')
  })

  it('humanizes unknown sources', () => {
    expect(formatConsultSource('foo_bar')).toBe('foo bar')
  })
})

describe('crmConsultUrl', () => {
  it('builds consult deep link', () => {
    expect(crmConsultUrl(CASE_ID)).toMatch(/\/consults\/ceb7a25d-0136-48b2-951e-a69fe93322c4$/)
  })
})

describe('buildExpertAssistSlackMessage', () => {
  it('formats open case with CRM button and no markdown asterisks', () => {
    const payload = buildExpertAssistSlackMessage({
      type: 'open',
      caseId: CASE_ID,
      shopName: 'Just Right Auto Repair',
      source: 'surfaces_web',
    })

    expect(payload.text).toContain('Just Right Auto Repair')
    expect(payload.text).toContain('/consults/ceb7a25d-0136-48b2-951e-a69fe93322c4')
    expect(payload.text).not.toContain('**')

    const body = JSON.stringify(payload)
    expect(body).toContain('Open in CRM')
    expect(body).toContain('https://crm.fixlane.app/consults/ceb7a25d-0136-48b2-951e-a69fe93322c4')
    expect(body).toContain('Web')
    expect(body).toContain('Just Right Auto Repair')
  })
})
