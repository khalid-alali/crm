import { describe, expect, it } from 'vitest'
import {
  computeToolboxCasePartner,
  shopNameToToolboxPartnerBase,
  toolboxPartnerSuffixFromLocationId,
} from './toolbox-partner'

describe('shopNameToToolboxPartnerBase', () => {
  it('removes spaces and non-alphanumeric characters', () => {
    expect(shopNameToToolboxPartnerBase('Oil Changers')).toBe('OILCHANGERS')
    expect(shopNameToToolboxPartnerBase('Midas - DTLA')).toBe('MIDASDTLA')
  })
})

describe('computeToolboxCasePartner', () => {
  const id = 'd2c6edc9-cba7-4231-9308-ad16c757d0d9'

  it('uses shop name only when base is available', () => {
    expect(computeToolboxCasePartner('Oil Changers', id, false)).toBe('OILCHANGERS')
  })

  it('appends last 4 of location id when base is taken', () => {
    expect(computeToolboxCasePartner('Oil Changers', id, true)).toBe(
      `OILCHANGERS${toolboxPartnerSuffixFromLocationId(id)}`,
    )
    expect(toolboxPartnerSuffixFromLocationId(id)).toBe('D0D9')
  })
})
