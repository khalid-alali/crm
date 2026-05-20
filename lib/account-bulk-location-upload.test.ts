import { describe, expect, it } from 'vitest'
import {
  buildBulkUploadDedupKey,
  parseBulkUploadCsv,
  previewBulkLocationUpload,
} from '@/lib/account-bulk-location-upload'

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
