import jwt from 'jsonwebtoken'

function secret() {
  const s = process.env.PORTAL_JWT_SECRET
  if (!s) throw new Error('PORTAL_JWT_SECRET is not set')
  return s
}

export type PortalJwtPayload = { locationId: string; type?: string }

/** JWT for capabilities portal links (BDR-generated, 30d). */
export function signCapabilitiesPortalToken(locationId: string) {
  return jwt.sign({ locationId, type: 'portal' }, secret(), { expiresIn: '30d' })
}

export function verifyCapabilitiesPortalToken(token: string): { locationId: string } {
  const decoded = jwt.verify(token, secret()) as PortalJwtPayload
  if (decoded.type !== 'portal') {
    throw new Error('Invalid portal token')
  }
  if (!decoded.locationId) throw new Error('Invalid portal token')
  return { locationId: decoded.locationId }
}

/**
 * Legacy partner-portal token (address/contact updates) — older tokens may omit `type`.
 * Accepts `{ locationId }` or `{ locationId, type: 'portal' }`.
 */
export function verifyPortalToken(token: string): { locationId: string } {
  const decoded = jwt.verify(token, secret()) as PortalJwtPayload
  if (decoded.type !== undefined && decoded.type !== 'portal') {
    throw new Error('Invalid portal token')
  }
  if (!decoded.locationId) throw new Error('Invalid portal token')
  return { locationId: decoded.locationId }
}
