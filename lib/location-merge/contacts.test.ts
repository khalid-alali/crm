import { describe, expect, it } from 'vitest'
import { countContactDedupes, type ContactRow } from '@/lib/location-merge/contacts'

const c = (partial: Partial<ContactRow> & { id: string }): ContactRow => ({
  id: partial.id,
  location_id: partial.location_id ?? null,
  account_id: partial.account_id ?? null,
  name: partial.name ?? null,
  email: partial.email ?? null,
  phone: partial.phone ?? null,
})

describe('contact dedupe', () => {
  it('dedupes when name+phone match', () => {
    const primary = [c({ id: '1', name: 'Jane Doe', phone: '(512) 555-0100' })]
    const secondary = [c({ id: '2', name: 'jane doe', phone: '5125550100' })]
    expect(countContactDedupes(primary, secondary)).toBe(1)
  })

  it('does not dedupe when only one field matches', () => {
    const primary = [c({ id: '1', name: 'Jane', email: 'a@b.com' })]
    const secondary = [c({ id: '2', name: 'Bob', email: 'a@b.com' })]
    expect(countContactDedupes(primary, secondary)).toBe(0)
  })
})
