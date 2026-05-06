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
  /** From `shop_status_cache` (`full_address`, else city/state/zip) when a cache row exists; otherwise CRM location line. */
  shop_address: string
  /** From `shop_status_cache` when `locations.motherduck_shop_id` links a row. */
  vinfast_store_code: string
  /** From `shop_status_cache` when linked. */
  dealer_code: string
  /** True when `locations.motherduck_shop_id` is set (admin shop link). */
  admin_shop_linked: boolean
  /** True when a `shop_status_cache` row exists for that shop id. */
  shop_status_cache_hit: boolean
  sender_first_name: string
  sender_full_name: string
}

const VINFAST_OR_DEALER_PLACEHOLDER = /\{\{\s*(vinfast_store_code|dealer_code)\s*\}\}/i

/** Raw template (before merge) references VinFast store or dealer code tokens. */
export function templateReferencesVinfastOrDealerCodes(subject: string, bodyHtml: string): boolean {
  return VINFAST_OR_DEALER_PLACEHOLDER.test(`${subject}\0${bodyHtml}`)
}

/**
 * Human-readable issues when a template expects admin cache codes but the shop cannot supply them.
 * Empty when the template does not use those placeholders.
 */
export function emailMergeWarningsForVinfastPlaceholders(
  templateSubject: string,
  templateBodyHtml: string,
  ctx: EmailMergeContext,
): string[] {
  if (!templateReferencesVinfastOrDealerCodes(templateSubject, templateBodyHtml)) return []
  if (!ctx.admin_shop_linked) {
    return [
      'This template uses {{vinfast_store_code}} or {{dealer_code}}, but this shop has no Admin shop ID. Those values were left blank.',
    ]
  }
  if (!ctx.shop_status_cache_hit) {
    return [
      'This template uses {{vinfast_store_code}} or {{dealer_code}}, but there is no admin shop cache row for this shop yet. Those values were left blank.',
    ]
  }
  return []
}

function firstToken(name: string | null | undefined): string {
  const t = (name ?? '').trim().split(/\s+/)[0]
  return t || 'there'
}

/** Single-line mailing address from location fields. */
export function formatShopAddressLine(parts: {
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}): string {
  const line1 = (parts.address_line1 ?? '').trim()
  const city = (parts.city ?? '').trim()
  const state = (parts.state ?? '').trim()
  const zip = (parts.postal_code ?? '').trim()
  const cityPart = [city, [state, zip].filter(Boolean).join(' ').trim()].filter(Boolean).join(', ')
  return [line1, cityPart].filter(Boolean).join(', ')
}

function shopAddressFromStatusCache(row: {
  full_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}): string {
  const full = typeof row.full_address === 'string' ? row.full_address.trim() : ''
  if (full) return full
  return formatShopAddressLine({
    address_line1: null,
    city: row.city,
    state: row.state,
    postal_code: row.zip,
  })
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
    .select('id, name, city, state, postal_code, address_line1, account_id, motherduck_shop_id')
    .eq('id', locationId)
    .maybeSingle()

  if (error || !loc) return null

  let vinfast_store_code = ''
  let dealer_code = ''
  let shop_status_cache_hit = false
  let shop_address = ''
  const shopIdRaw = typeof loc.motherduck_shop_id === 'string' ? loc.motherduck_shop_id.trim() : ''
  if (shopIdRaw) {
    const { data: cacheRow } = await supabase
      .from('shop_status_cache')
      .select('vinfast_store_code, dealer_code, full_address, city, state, zip')
      .eq('shop_id', shopIdRaw)
      .maybeSingle()
    shop_status_cache_hit = Boolean(cacheRow)
    if (cacheRow) {
      vinfast_store_code = typeof cacheRow.vinfast_store_code === 'string' ? cacheRow.vinfast_store_code.trim() : ''
      dealer_code = typeof cacheRow.dealer_code === 'string' ? cacheRow.dealer_code.trim() : ''
      shop_address = shopAddressFromStatusCache(cacheRow)
    } else {
      shop_address = formatShopAddressLine({
        address_line1: loc.address_line1,
        city: loc.city,
        state: loc.state,
        postal_code: loc.postal_code,
      })
    }
  } else {
    shop_address = formatShopAddressLine({
      address_line1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      postal_code: loc.postal_code,
    })
  }

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
    shop_address,
    vinfast_store_code,
    dealer_code,
    admin_shop_linked: Boolean(shopIdRaw),
    shop_status_cache_hit,
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
    shop_address: ctx.shop_address,
    vinfast_store_code: ctx.vinfast_store_code,
    dealer_code: ctx.dealer_code,
    sender_first_name: ctx.sender_first_name,
    sender_full_name: ctx.sender_full_name,
    sender_name: ctx.sender_full_name,
  }
}
