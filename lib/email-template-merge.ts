import type { Session } from 'next-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePrimaryContact } from '@/lib/primary-contact'

export type EmailMergeContext = {
  locationId: string
  contact_first_name: string
  contact_full_name: string
  shop_name: string
  shop_city: string
  shop_state: string
  sender_first_name: string
  sender_full_name: string
}

function firstToken(name: string | null | undefined): string {
  const t = (name ?? '').trim().split(/\s+/)[0]
  return t || 'there'
}

function senderDisplay(session: Session): { full: string; first: string } {
  const full = (session.user?.name ?? session.user?.email ?? 'RepairWise').trim() || 'RepairWise'
  return { full, first: firstToken(full) }
}

/** Load merge fields for a location + signed-in BDR. Returns null if location is missing. */
export async function buildEmailMergeContext(
  supabase: SupabaseClient,
  locationId: string,
  session: Session,
): Promise<EmailMergeContext | null> {
  const { data: loc, error } = await supabase
    .from('locations')
    .select('id, name, city, state, account_id')
    .eq('id', locationId)
    .maybeSingle()

  if (error || !loc) return null

  const contact = loc.account_id
    ? await resolvePrimaryContact(supabase, loc.account_id, loc.id)
    : null

  const contactFull = (contact?.name ?? '').trim() || (contact?.email ?? '').trim() || ''
  const sender = senderDisplay(session)

  return {
    locationId: loc.id,
    contact_first_name: firstToken(contact?.name ?? contact?.email),
    contact_full_name: contactFull || 'there',
    shop_name: loc.name ?? '',
    shop_city: loc.city ?? '',
    shop_state: loc.state ?? '',
    sender_first_name: sender.first,
    sender_full_name: sender.full,
  }
}

/** Flat map for placeholder replacement (includes legacy aliases). */
export function mergeContextToStaticMap(ctx: EmailMergeContext): Record<string, string> {
  return {
    contact_first_name: ctx.contact_first_name,
    contact_full_name: ctx.contact_full_name,
    contact_name: ctx.contact_full_name,
    shop_name: ctx.shop_name,
    shop_city: ctx.shop_city,
    shop_state: ctx.shop_state,
    sender_first_name: ctx.sender_first_name,
    sender_full_name: ctx.sender_full_name,
    sender_name: ctx.sender_full_name,
  }
}
