import { describe, expect, it } from 'vitest'
import {
  buildContactPhoneIndex,
  dialpadContactDisplayName,
} from '@/lib/dialpad-contact-lookup'
import type { DialpadContact } from '@/lib/dialpad-api'

describe('dialpadContactDisplayName', () => {
  it('prefers display_name, then company_name, then person name', () => {
    expect(dialpadContactDisplayName({ display_name: 'Carotech' })).toBe('Carotech')
    expect(dialpadContactDisplayName({ company_name: 'Carotech', first_name: 'Sal' })).toBe('Carotech')
    expect(dialpadContactDisplayName({ first_name: 'Sal', last_name: 'Rivas' })).toBe('Sal Rivas')
  })
})

describe('buildContactPhoneIndex', () => {
  it('indexes contacts by normalized phone', () => {
    const contacts: DialpadContact[] = [
      {
        display_name: 'Carotech',
        phones: ['+14242834303'],
        primary_phone: '+14242834303',
      },
    ]
    const index = buildContactPhoneIndex(contacts)
    expect(index.get('14242834303')).toBe('Carotech')
  })
})
