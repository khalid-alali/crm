import { randomBytes } from 'crypto'

export function generateDecisionToken(): string {
  return randomBytes(32).toString('base64url')
}
