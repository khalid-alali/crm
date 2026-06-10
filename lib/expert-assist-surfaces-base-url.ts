import type { NextRequest } from 'next/server'

const PRODUCTION_SURFACES_BASE = 'https://expert-assist.fixlane.app'
const LOCAL_SURFACES_BASE = 'http://localhost:3001'

function trimBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/$/, '')
  return trimmed || undefined
}

function isLocalHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? ''
  return h === 'localhost' || h === '127.0.0.1'
}

/** Public base URL for Expert Assist shop surfaces (`/s/<token>`). */
export function expertAssistSurfacesBaseUrl(req?: NextRequest): string {
  const fromSurfacesEnv = trimBaseUrl(process.env.EXPERT_ASSIST_SURFACES_PUBLIC_URL)
  if (fromSurfacesEnv) return fromSurfacesEnv

  const fromIntakeEnv = trimBaseUrl(process.env.EXPERT_ASSIST_INTAKE_PUBLIC_URL)
  if (fromIntakeEnv) return fromIntakeEnv

  if (req) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (host && isLocalHost(host)) {
      const proto = req.headers.get('x-forwarded-proto') ?? 'http'
      return `${proto}://${host}`.replace(/\/$/, '')
    }
  }

  return process.env.NODE_ENV === 'production' ? PRODUCTION_SURFACES_BASE : LOCAL_SURFACES_BASE
}
