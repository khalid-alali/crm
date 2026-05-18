import type { NextRequest } from 'next/server'

/** Public base URL for Expert Assist shop surfaces (`/s/<token>`). */
export function expertAssistSurfacesBaseUrl(req?: NextRequest): string {
  const fromEnv = process.env.EXPERT_ASSIST_SURFACES_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (req) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    const proto = req.headers.get('x-forwarded-proto') ?? 'http'
    if (host) return `${proto}://${host}`.replace(/\/$/, '')
  }
  return 'http://localhost:3001'
}
