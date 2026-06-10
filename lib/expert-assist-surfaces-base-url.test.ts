import { afterEach, describe, expect, it, vi } from 'vitest'
import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'

function mockReq(host: string, proto = 'https') {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'x-forwarded-host' || name === 'host') return host
        if (name === 'x-forwarded-proto') return proto
        return null
      },
    },
  } as never
}

describe('expertAssistSurfacesBaseUrl', () => {
  const env = process.env

  afterEach(() => {
    process.env = { ...env }
    vi.unstubAllEnvs()
  })

  it('prefers EXPERT_ASSIST_SURFACES_PUBLIC_URL', () => {
    vi.stubEnv('EXPERT_ASSIST_SURFACES_PUBLIC_URL', 'https://surfaces.example/')
    vi.stubEnv('EXPERT_ASSIST_INTAKE_PUBLIC_URL', 'https://intake.example')
    expect(expertAssistSurfacesBaseUrl(mockReq('crm.fixlane.app'))).toBe('https://surfaces.example')
  })

  it('falls back to EXPERT_ASSIST_INTAKE_PUBLIC_URL', () => {
    vi.stubEnv('EXPERT_ASSIST_SURFACES_PUBLIC_URL', '')
    vi.stubEnv('EXPERT_ASSIST_INTAKE_PUBLIC_URL', 'https://expert-assist.fixlane.app/')
    expect(expertAssistSurfacesBaseUrl(mockReq('crm.fixlane.app'))).toBe('https://expert-assist.fixlane.app')
  })

  it('does not use CRM request host in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EXPERT_ASSIST_SURFACES_PUBLIC_URL', '')
    vi.stubEnv('EXPERT_ASSIST_INTAKE_PUBLIC_URL', '')
    expect(expertAssistSurfacesBaseUrl(mockReq('crm.fixlane.app'))).toBe('https://expert-assist.fixlane.app')
  })

  it('uses localhost request host in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('EXPERT_ASSIST_SURFACES_PUBLIC_URL', '')
    vi.stubEnv('EXPERT_ASSIST_INTAKE_PUBLIC_URL', '')
    expect(expertAssistSurfacesBaseUrl(mockReq('localhost:3001', 'http'))).toBe('http://localhost:3001')
  })
})
