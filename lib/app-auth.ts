import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'

/** Local-only escape hatch: set AUTH_BYPASS=true in .env.local while running `next dev`. Never enable in production. */
export function isAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS === 'true'
}

function devBypassSession(): Session {
  return {
    user: {
      name: process.env.AUTH_BYPASS_USER ?? 'Local Dev',
      email: process.env.AUTH_BYPASS_EMAIL ?? 'dev@localhost',
    },
    expires: new Date(Date.now() + 86400000 * 30).toISOString(),
  }
}

/** Use instead of getServerSession() so dev bypass applies consistently (layout + API routes). */
export async function getAppSession(): Promise<Session | null> {
  const session = await getServerSession()
  if (session) return session
  if (isAuthBypassEnabled()) return devBypassSession()
  return null
}
