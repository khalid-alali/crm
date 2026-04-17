import type { SupabaseClient } from '@supabase/supabase-js'

/** Upsert the default shop-scoped contact row for a location (portal + legacy primary fields). */
export async function upsertLocationShopContact(
  supabase: SupabaseClient,
  params: {
    locationId: string
    accountId: string
    name: string | null | undefined
    email: string | null | undefined
    phone: string | null | undefined
  },
): Promise<void> {
  const name = typeof params.name === 'string' ? params.name.trim() : ''
  const email = typeof params.email === 'string' ? params.email.trim() : ''
  const phone = typeof params.phone === 'string' ? params.phone.trim() : ''

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('location_id', params.locationId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const payload = {
    account_id: params.accountId,
    location_id: params.locationId,
    name: name || null,
    email: email || null,
    phone: phone || null,
    role: 'owner' as const,
    is_primary: false,
  }

  if (existing?.id) {
    await supabase.from('contacts').update(payload).eq('id', existing.id)
  } else if (name || email || phone) {
    await supabase.from('contacts').insert(payload)
  }
}
