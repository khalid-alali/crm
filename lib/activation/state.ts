import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import type { ActivationStateRow, ActivationStateView, ActivationVariant } from '@/lib/activation/types'

type LocationJoinRow = {
  id: string
  name: string
  account_id: string | null
  toolbox_case_partner: string | null
  consult_billing_email: string | null
  consult_service_writer_contact_id: string | null
  consult_enabled: boolean | null
}

type ServiceWriterContactRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

const LOCATION_SEND_FIELDS =
  'id, name, account_id, toolbox_case_partner, consult_billing_email, consult_service_writer_contact_id, consult_enabled'

async function loadSendContext(
  supabase: SupabaseClient,
  location: LocationJoinRow,
): Promise<
  Pick<
    ActivationStateView,
    | 'shopName'
    | 'ownerEmail'
    | 'ownerName'
    | 'ownerPhone'
    | 'frontDeskPhone'
    | 'serviceWriterEmail'
    | 'serviceWriterName'
    | 'toolboxCasePartner'
  >
> {
  let ownerEmail: string | null = location.consult_billing_email
  let ownerName: string | null = null
  let ownerPhone: string | null = null
  let frontDeskPhone: string | null = null
  let serviceWriterEmail: string | null = null
  let serviceWriterName: string | null = null

  if (location.account_id) {
    const primary = await resolvePrimaryContact(supabase, location.account_id, location.id)
    if (primary) {
      ownerName = primary.name
      ownerEmail = ownerEmail ?? primary.email
      ownerPhone = primary.phone
    }
  }

  if (location.consult_service_writer_contact_id) {
    const { data: writer, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone')
      .eq('id', location.consult_service_writer_contact_id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    const contact = writer as ServiceWriterContactRow | null
    if (contact) {
      serviceWriterEmail = contact.email
      serviceWriterName = contact.name
      frontDeskPhone = contact.phone
      if (contact.name && !ownerName) ownerName = contact.name
      if (contact.email && !ownerEmail) ownerEmail = contact.email
    }
  }

  return {
    shopName: location.name,
    ownerEmail,
    ownerName,
    ownerPhone,
    frontDeskPhone,
    serviceWriterEmail,
    serviceWriterName,
    toolboxCasePartner: location.toolbox_case_partner,
  }
}

function toActivationView(
  row: ActivationStateRow,
  location: LocationJoinRow,
  send: Awaited<ReturnType<typeof loadSendContext>>,
): ActivationStateView {
  return {
    ...row,
    locationId: row.location_id,
    ...send,
  }
}

export async function ensureActivationState(
  supabase: SupabaseClient,
  locationId: string,
  opts?: { activationVariant?: ActivationVariant; isHighValue?: boolean },
): Promise<ActivationStateRow> {
  const insert: Record<string, unknown> = { location_id: locationId }
  if (opts?.activationVariant) insert.activation_variant = opts.activationVariant
  if (opts?.isHighValue != null) insert.is_high_value = opts.isHighValue

  const { data, error } = await supabase
    .from('activation_state')
    .upsert(insert, { onConflict: 'location_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data) return data as ActivationStateRow

  const { data: existing, error: loadError } = await supabase
    .from('activation_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!existing) throw new Error(`Failed to ensure activation_state for ${locationId}`)
  return existing as ActivationStateRow
}

export async function getState(
  supabase: SupabaseClient,
  locationId: string,
): Promise<ActivationStateView | null> {
  const { data: location, error: locError } = await supabase
    .from('locations')
    .select(LOCATION_SEND_FIELDS)
    .eq('id', locationId)
    .maybeSingle()

  if (locError) throw new Error(locError.message)
  if (!location) return null

  const loc = location as LocationJoinRow

  const { data: state, error: stateError } = await supabase
    .from('activation_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle()

  if (stateError) throw new Error(stateError.message)

  const send = await loadSendContext(supabase, loc)
  if (!state) return null

  return toActivationView(state as ActivationStateRow, loc, send)
}

export async function getStateOrThrow(
  supabase: SupabaseClient,
  locationId: string,
): Promise<ActivationStateView> {
  const state = await getState(supabase, locationId)
  if (!state) throw new Error(`activation_state not found for location ${locationId}`)
  return state
}
