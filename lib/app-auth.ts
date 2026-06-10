import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth-options'

/** NextAuth session cookies (including chunked `.0`, `.1`, … suffixes). */
const SESSION_COOKIE_MARKERS = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  '__Host-next-auth.session-token',
] as const

function isNextAuthSessionCookie(name: string): boolean {
  return SESSION_COOKIE_MARKERS.some(
    marker => name === marker || name.startsWith(`${marker}.`),
  )
}

/** Drop unreadable session cookies so JWT decrypt is not retried every request. */
async function clearStaleNextAuthCookies(): Promise<void> {
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (isNextAuthSessionCookie(cookie.name)) {
      cookieStore.delete(cookie.name)
    }
  }
}

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
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
  } catch {
    session = null
  }

  if (session) return session

  const cookieStore = await cookies()
  const hasSessionCookie = cookieStore.getAll().some(c => isNextAuthSessionCookie(c.name))
  // Stale cookie (e.g. NEXTAUTH_SECRET rotated) → decrypt fails with JWT_SESSION_ERROR.
  if (hasSessionCookie) await clearStaleNextAuthCookies()

  if (isAuthBypassEnabled()) return devBypassSession()
  return null
}
