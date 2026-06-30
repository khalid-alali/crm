import { describe, expect, it } from 'vitest'
import { requireResendConfig } from '@/lib/activation/runtime-env'

describe('requireResendConfig', () => {
  it('throws when RESEND_API_KEY is missing', () => {
    const prev = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
    try {
      expect(() => requireResendConfig('test send')).toThrow(/RESEND_API_KEY/)
    } finally {
      if (prev === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = prev
    }
  })

  it('returns api key and from when configured', () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM = 'Fixlane <ops@fixlane.com>'
    expect(requireResendConfig('test send')).toEqual({
      apiKey: 're_test',
      from: 'Fixlane <ops@fixlane.com>',
    })
  })
})
