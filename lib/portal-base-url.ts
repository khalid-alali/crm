import type { NextRequest } from 'next/server'

/**
 * Public base URL for portal/capabilities links (generate-token, email send, etc.).
 * Prefer `PORTAL_PUBLIC_BASE_URL` in production (e.g. https://shop.fixlane.com) so links
 * are not tied to `NEXTAUTH_URL` or the request host (which may be localhost behind proxies).
 */
export function portalBaseUrl(req: NextRequest): string {
  const portalPublic = process.env.PORTAL_PUBLIC_BASE_URL?.trim().replace(/\/$/, '')
  if (portalPublic) return portalPublic
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (env) return env
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}
