import { describe, expect, it } from 'vitest'
import { groupAccountContactsForDisplay } from '@/lib/account-contacts-display'

const row = (
  partial: Partial<{
    id: string
    location_id: string | null
    name: string | null
    email: string | null
    phone: string | null
    is_primary: boolean
    created_at: string
  }> & { id: string },
) => ({
  id: partial.id,
  location_id: partial.location_id ?? null,
  name: partial.name ?? 'Richard Gonzales',
  email: partial.email ?? 'r.gonzalesautos@gmail.com',
  phone: partial.phone ?? '209-484-1190',
  is_primary: partial.is_primary ?? false,
  created_at: partial.created_at ?? '2024-01-01T00:00:00Z',
})

describe('groupAccountContactsForDisplay', () => {
  const locations = [
    { id: 'loc-south', name: 'Midas Modesto South' },
    { id: 'loc-north', name: 'Midas Modesto North' },
    { id: 'loc-manteca', name: 'Manteca' },
  ]

  it('merges account-wide and location-scoped duplicates', () => {
    const groups = groupAccountContactsForDisplay(
      [
        row({ id: '1', location_id: null, is_primary: true }),
        row({ id: '2', location_id: 'loc-south' }),
        row({ id: '3', location_id: 'loc-north' }),
        row({ id: '4', location_id: 'loc-manteca' }),
      ],
      locations,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.contacts).toHaveLength(4)
    expect(groups[0]!.representative.id).toBe('1')
    expect(groups[0]!.locationLabels).toEqual([
      'Account-wide',
      'Manteca',
      'Midas Modesto North',
      'Midas Modesto South',
    ])
  })

  it('keeps distinct people separate', () => {
    const groups = groupAccountContactsForDisplay(
      [
        row({ id: '1', name: 'Richard Gonzales' }),
        row({
          id: '2',
          name: 'Herman Rodriguez',
          email: 'hsrodriguez9@gmail.com',
          phone: '209-505-6120',
        }),
      ],
      locations,
    )
    expect(groups).toHaveLength(2)
  })

  it('does not merge when identity fields differ', () => {
    const groups = groupAccountContactsForDisplay(
      [row({ id: '1', phone: '209-111-1111' }), row({ id: '2', phone: '209-222-2222' })],
      locations,
    )
    expect(groups).toHaveLength(2)
  })
})
