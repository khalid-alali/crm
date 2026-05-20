import { describe, expect, it } from 'vitest'
import { buildFieldPreviews, resolveMergeValue } from '@/lib/location-merge/resolve'
import type { MergeColumnMeta } from '@/lib/location-merge/types'

const col = (name: string, udt: string, dataType = 'text', maxLen: number | null = null): MergeColumnMeta => ({
  column_name: name,
  data_type: dataType,
  udt_name: udt,
  is_nullable: 'YES',
  character_maximum_length: maxLen,
})

describe('resolveMergeValue', () => {
  it('ORs booleans', () => {
    expect(resolveMergeValue(col('x', 'bool', 'boolean'), false, true)).toBe(true)
  })

  it('picks most advanced pipeline status', () => {
    expect(resolveMergeValue(col('status', 'text'), 'lead', 'contracted')).toBe('contracted')
  })

  it('concatenates notes-like fields', () => {
    const result = resolveMergeValue(col('notes', 'text', 'text', 5000), 'A', 'B')
    expect(String(result)).toContain('A')
    expect(String(result)).toContain('B')
  })

  it('prefers earlier timestamps', () => {
    expect(
      resolveMergeValue(col('capabilities_submitted_at', 'timestamptz', 'timestamp with time zone'), '2026-02-01', '2026-01-01'),
    ).toBe('2026-01-01')
  })
})

describe('buildFieldPreviews', () => {
  it('classifies conflict vs autofill', () => {
    const columns = [col('city', 'text'), col('chain_name', 'text')]
    const fields = buildFieldPreviews(
      columns,
      { city: 'Austin', chain_name: null },
      { city: 'Dallas', chain_name: 'Joe Group' },
    )
    const city = fields.find(f => f.key === 'city')
    const chain = fields.find(f => f.key === 'chain_name')
    expect(city?.type).toBe('conflict')
    expect(chain?.type).toBe('autofill')
  })
})
