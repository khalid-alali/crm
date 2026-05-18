import { describe, expect, it } from 'vitest'
import {
  CONSULT_MMS_MAX_BYTES,
  hasInboundMedia,
  inboundMediaCount,
  validateConsultMmsUpload,
} from '@/lib/expert-assist/consult-media'

describe('validateConsultMmsUpload', () => {
  it('accepts common image types within size limit', () => {
    expect(validateConsultMmsUpload('image/jpeg', 1024)).toBeNull()
    expect(validateConsultMmsUpload('image/png', CONSULT_MMS_MAX_BYTES)).toBeNull()
  })

  it('rejects unsupported types and oversized files', () => {
    expect(validateConsultMmsUpload('application/pdf', 100)).toMatch(/JPEG/)
    expect(validateConsultMmsUpload('image/jpeg', CONSULT_MMS_MAX_BYTES + 1)).toMatch(/4 MB/)
    expect(validateConsultMmsUpload('image/jpeg', 0)).toMatch(/empty/)
  })
})

describe('inbound media helpers', () => {
  it('reads NumMedia from Twilio webhook params', () => {
    expect(inboundMediaCount({ NumMedia: '2' })).toBe(2)
    expect(hasInboundMedia({ NumMedia: '1', MediaUrl0: 'https://api.twilio.com/...' })).toBe(true)
    expect(hasInboundMedia({ NumMedia: '0' })).toBe(false)
  })
})
