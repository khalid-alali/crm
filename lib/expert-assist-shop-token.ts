import jwt from 'jsonwebtoken'

function secret() {
  const s = process.env.EXPERT_ASSIST_SHOP_JWT_SECRET?.trim() || process.env.PORTAL_JWT_SECRET?.trim()
  if (!s) throw new Error('EXPERT_ASSIST_SHOP_JWT_SECRET (or PORTAL_JWT_SECRET) is not set')
  return s
}

export type ExpertAssistShopJwtPayload = {
  locationId: string
  type: 'expert_assist_shop'
}

/** Long-lived invite token for public /s/<token> surfaces (no expiry). */
export function signExpertAssistShopToken(locationId: string): string {
  return jwt.sign({ locationId, type: 'expert_assist_shop' } satisfies ExpertAssistShopJwtPayload, secret())
}

export function verifyExpertAssistShopToken(token: string): { locationId: string } {
  const decoded = jwt.verify(token, secret()) as ExpertAssistShopJwtPayload
  if (decoded.type !== 'expert_assist_shop') {
    throw new Error('Invalid invite token')
  }
  if (!decoded.locationId?.trim()) throw new Error('Invalid invite token')
  return { locationId: decoded.locationId.trim() }
}
