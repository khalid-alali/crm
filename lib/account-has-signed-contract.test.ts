import { describe, expect, it } from 'vitest'
import { initialLocationStatusForAccount } from '@/lib/account-has-signed-contract'

describe('initialLocationStatusForAccount', () => {
  it('uses contracted (Signed) when account has a signed contract', () => {
    expect(initialLocationStatusForAccount(true)).toBe('contracted')
  })

  it('uses lead when account has no signed contract', () => {
    expect(initialLocationStatusForAccount(false)).toBe('lead')
  })
})
