import jwt from 'jsonwebtoken'

export const generatePortalToken = (locationId: string) =>
  jwt.sign({ locationId }, process.env.PORTAL_JWT_SECRET!, { expiresIn: '7d' })

export const verifyPortalToken = (token: string) =>
  jwt.verify(token, process.env.PORTAL_JWT_SECRET!) as { locationId: string }
