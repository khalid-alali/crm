import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signConsultMediaPath, verifyConsultMediaPath } from '@/lib/expert-assist/mms-media-url'

describe('consult media URL signing', () => {
  const env = process.env

  beforeEach(() => {
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = 'test-webhook-secret'
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('round-trips valid paths before expiry', () => {
    const path = 'cases/abc/photo.jpg'
    const exp = Math.floor(Date.now() / 1000) + 600
    const sig = signConsultMediaPath(path, exp)
    expect(verifyConsultMediaPath(path, exp, sig)).toBe(true)
    expect(verifyConsultMediaPath('cases/other/../x', exp, sig)).toBe(false)
    expect(verifyConsultMediaPath(path, exp - 1200, sig)).toBe(false)
  })
})
