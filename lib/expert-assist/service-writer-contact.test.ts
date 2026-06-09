import { describe, expect, it, vi } from 'vitest'
import { upsertExpertAssistServiceWriter } from '@/lib/expert-assist/service-writer-contact'

function mockSupabase(handlers: {
  location?: { consult_service_writer_contact_id: string | null }
  insertContactId?: string
}) {
  const updates: Array<{ table: string; payload: unknown }> = []
  const inserts: Array<{ table: string; payload: unknown }> = []

  const supabase = {
    from: (table: string) => {
      if (table === 'locations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: handlers.location ?? { consult_service_writer_contact_id: null },
                error: null,
              }),
            }),
          }),
          update: (payload: unknown) => {
            updates.push({ table, payload })
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      if (table === 'contacts') {
        return {
          update: (payload: unknown) => {
            updates.push({ table, payload })
            return {
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }
          },
          insert: (payload: unknown) => {
            inserts.push({ table, payload })
            return {
              select: () => ({
                single: async () => ({
                  data: { id: handlers.insertContactId ?? 'contact-new' },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      if (table === 'shop_approved_contacts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          insert: (payload: unknown) => {
            inserts.push({ table, payload })
            return {
              select: () => ({
                single: async () => ({ data: { id: 'approved-1' }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { supabase, updates, inserts }
}

describe('upsertExpertAssistServiceWriter', () => {
  it('creates contact flagged for expert assist and links location', async () => {
    const { supabase, inserts, updates } = mockSupabase({})
    const res = await upsertExpertAssistServiceWriter(supabase as never, {
      locationId: 'loc-1',
      accountId: 'acct-1',
      name: 'Alex Writer',
      email: 'alex@shop.com',
      phone: '4155550100',
      isOwner: true,
    })

    expect(res.contactId).toBe('contact-new')
    expect(res.approvedContactId).toBe('approved-1')
    expect(inserts.some(i => i.table === 'contacts' && (i.payload as { is_expert_assist_service_writer: boolean }).is_expert_assist_service_writer)).toBe(true)
    expect(updates.some(u => u.table === 'locations' && (u.payload as { consult_service_writer_is_owner: boolean }).consult_service_writer_is_owner)).toBe(true)
  })

  it('requires a name', async () => {
    const { supabase } = mockSupabase({})
    await expect(
      upsertExpertAssistServiceWriter(supabase as never, {
        locationId: 'loc-1',
        accountId: null,
        name: '  ',
        email: null,
        phone: null,
        isOwner: false,
        syncApprovedSmsContact: false,
      }),
    ).rejects.toThrow('name is required')
  })
})
