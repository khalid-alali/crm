import { describe, expect, it } from 'vitest'
import {
  buildBulkUploadDedupKey,
  classifyShopNumberColumnValue,
  parseBulkUploadCsv,
  previewBulkLocationUpload,
} from '@/lib/account-bulk-location-upload'

describe('classifyShopNumberColumnValue', () => {
  it('maps 10 digits to phone', () => {
    expect(classifyShopNumberColumnValue('(555) 123-4567')).toEqual({
      contactPhone: '5551234567',
      storeNumber: null,
    })
  })

  it('maps fewer than 10 digits to store number', () => {
    expect(classifyShopNumberColumnValue('4821')).toEqual({
      contactPhone: '',
      storeNumber: '4821',
    })
  })
})

describe('previewBulkLocationUpload', () => {
  it('counts creates, skips, and duplicate rows', () => {
    const csv = [
      'Address,State,Zip,Name,Email',
      '100 Main St,CA,90210,Shop A,a@example.com',
      '200 Oak Ave,CA,90211,,',
      '100 Main St,CA,90210,Duplicate,',
    ].join('\n')

    const parsed = parseBulkUploadCsv(csv)
    if ('error' in parsed) throw new Error(parsed.error)

    const existing = new Set([buildBulkUploadDedupKey('300 Pine Rd', 'CA', '90212')])
    const preview = previewBulkLocationUpload(parsed, existing)

    expect(preview.wouldCreate).toBe(2)
    expect(preview.wouldSkip).toBe(1)
    expect(preview.contactsWouldCreate).toBe(1)
    expect(preview.errors).toHaveLength(0)
    expect(preview.rows.filter(r => r.outcome === 'create')).toHaveLength(2)
    expect(preview.rows.find(r => r.outcome === 'skip_duplicate')?.row).toBe(4)
  })

  it('uses short shop number as store code, not phone', () => {
    const csv = [
      'Address,State,Zip,Name,Shop Number',
      '100 Main St,CA,90210,Midas Tupelo,4821',
    ].join('\n')
    const parsed = parseBulkUploadCsv(csv)
    if ('error' in parsed) throw new Error(parsed.error)
    const preview = previewBulkLocationUpload(parsed, new Set())
    expect(preview.contactsWouldCreate).toBe(0)
    expect(preview.rows[0]?.contactKind).toBeNull()
  })

  it('uses 10-digit shop number as phone when no phone column', () => {
    const csv = [
      'Address,State,Zip,Name,Shop Number',
      '100 Main St,CA,90210,Midas Tupelo,5551234567',
    ].join('\n')
    const parsed = parseBulkUploadCsv(csv)
    if ('error' in parsed) throw new Error(parsed.error)
    const preview = previewBulkLocationUpload(parsed, new Set())
    expect(preview.contactsWouldCreate).toBe(1)
    expect(preview.rows[0]?.contactKind).toBe('phone')
  })

  it('prefers dedicated phone column over 10-digit shop number', () => {
    const csv = [
      'Address,State,Zip,Shop Number,Phone',
      '100 Main St,CA,90210,5559999999,5551112222',
    ].join('\n')
    const parsed = parseBulkUploadCsv(csv)
    if ('error' in parsed) throw new Error(parsed.error)
    const preview = previewBulkLocationUpload(parsed, new Set())
    expect(preview.rows[0]?.contactKind).toBe('phone')
  })

  it('reports validation errors as skipped rows', () => {
    const csv = ['Address,State,Zip', ',CA,90210'].join('\n')
    const parsed = parseBulkUploadCsv(csv)
    if ('error' in parsed) throw new Error(parsed.error)

    const preview = previewBulkLocationUpload(parsed, new Set())
    expect(preview.wouldCreate).toBe(0)
    expect(preview.wouldSkip).toBe(1)
    expect(preview.errors[0]?.message).toMatch(/Address is required/)
  })
})
