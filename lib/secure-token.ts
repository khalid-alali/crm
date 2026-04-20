import { timingSafeEqual } from 'node:crypto'

function toBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

/**
 * Compares secrets without leaking timing differences for equal-length inputs.
 */
export function secureTokenEquals(providedToken: string, expectedToken: string): boolean {
  const provided = toBuffer(providedToken)
  const expected = toBuffer(expectedToken)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
