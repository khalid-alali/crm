import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'

export type ExpertAssistServiceWriterInput = {
  locationId: string
  accountId: string | null
  name: string
  email: string | null
  phone: string | null
  /** Signup checkbox: "I'm the service writer" */
  isOwner: boolean
  /**
   * When true (default if phone present), upsert shop_approved_contacts so this mobile can SMS the expert.
   */
  syncApprovedSmsContact?: boolean
}

export type ExpertAssistServiceWriterResult = {
  contactId: string
  approvedContactId: string | null
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = typeof value === 'string' ? value.trim() : ''
  return t || null
}

/**
 * Persists the Expert Assist service writer from signup:
 * - location-scoped contacts row (role service_advisor + is_expert_assist_service_writer)
 * - locations.consult_service_writer_contact_id + consult_service_writer_is_owner
 * - optional shop_approved_contacts row for SMS consult authorization
 */
export async function upsertExpertAssistServiceWriter(
  supabase: SupabaseClient,
  input: ExpertAssistServiceWriterInput,
): Promise<ExpertAssistServiceWriterResult> {
  const name = input.name.trim()
  if (!name) throw new Error('Service writer name is required')

  const email = trimOrNull(input.email)
  const phoneRaw = trimOrNull(input.phone)
  const smsPhone = phoneRaw ? normalizeSmsAddress(phoneRaw) : null
  const syncSms = input.syncApprovedSmsContact ?? Boolean(smsPhone)

  const { data: existingLink } = await supabase
    .from('locations')
    .select('consult_service_writer_contact_id')
    .eq('id', input.locationId)
    .maybeSingle()

  const existingContactId =
    (existingLink as { consult_service_writer_contact_id: string | null } | null)
      ?.consult_service_writer_contact_id ?? null

  await supabase
    .from('contacts')
    .update({ is_expert_assist_service_writer: false })
    .eq('location_id', input.locationId)
    .eq('is_expert_assist_service_writer', true)

  const contactPayload = {
    account_id: input.accountId,
    location_id: input.locationId,
    name,
    email,
    phone: phoneRaw,
    role: 'service_advisor' as const,
    is_primary: false,
    is_expert_assist_service_writer: true,
  }

  let contactId = existingContactId
  if (contactId) {
    const { error } = await supabase.from('contacts').update(contactPayload).eq('id', contactId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await supabase.from('contacts').insert(contactPayload).select('id').single()
    if (error) throw new Error(error.message)
    contactId = data.id as string
  }

  const { error: locError } = await supabase
    .from('locations')
    .update({
      consult_service_writer_contact_id: contactId,
      consult_service_writer_is_owner: input.isOwner,
    })
    .eq('id', input.locationId)

  if (locError) throw new Error(locError.message)

  let approvedContactId: string | null = null
  if (syncSms && smsPhone) {
    const now = new Date().toISOString()
    const { data: existingApproved } = await supabase
      .from('shop_approved_contacts')
      .select('id, status')
      .eq('shop_id', input.locationId)
      .eq('phone_number', smsPhone)
      .maybeSingle()

    if (existingApproved?.id) {
      const { error } = await supabase
        .from('shop_approved_contacts')
        .update({
          display_name: name,
          status: 'approved',
          approved_at: now,
          approved_by_user_id: 'signup',
        })
        .eq('id', existingApproved.id)
      if (error) throw new Error(error.message)
      approvedContactId = existingApproved.id as string
    } else {
      const { data, error } = await supabase
        .from('shop_approved_contacts')
        .insert({
          shop_id: input.locationId,
          phone_number: smsPhone,
          display_name: name,
          status: 'approved',
          added_via: 'signup',
          approved_at: now,
          approved_by_user_id: 'signup',
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      approvedContactId = data?.id as string
    }
  }

  return { contactId, approvedContactId }
}
