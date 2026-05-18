import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveTwilioMessagingOpts,
  TWILIO_MESSAGING_SERVICE_SID_RE,
} from '@/lib/expert-assist/twilio-messaging'

const VALID_MG = 'MG' + 'a'.repeat(32)

describe('TWILIO_MESSAGING_SERVICE_SID_RE', () => {
  it('matches valid messaging service SIDs', () => {
    expect(TWILIO_MESSAGING_SERVICE_SID_RE.test(VALID_MG)).toBe(true)
    expect(TWILIO_MESSAGING_SERVICE_SID_RE.test('AC' + 'a'.repeat(32))).toBe(false)
  })
})

describe('resolveTwilioMessagingOpts', () => {
  const env = process.env

  afterEach(() => {
    process.env = { ...env }
  })

  it('uses valid MG sid when set', () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = VALID_MG
    process.env.TWILIO_FROM_NUMBER = '+15551234567'
    expect(resolveTwilioMessagingOpts()).toEqual({ messagingServiceSid: VALID_MG })
  })

  it('falls back to FROM when MG sid is invalid', () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_ACCOUNT_SID ?? 'ACinvalid'
    process.env.TWILIO_FROM_NUMBER = '+15559876543'
    expect(resolveTwilioMessagingOpts()).toEqual({ from: '+15559876543' })
  })
})
