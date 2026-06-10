import type { SupabaseClient } from '@supabase/supabase-js'
import { activationVariantFromSkipCard } from '@/lib/activation/signup'
import type { ActivationVariant } from '@/lib/activation/types'
import { qualifiesForFreeConsultWithoutCard } from '@/lib/expert-assist/free-consult'
import { upsertExpertAssistServiceWriter } from '@/lib/expert-assist/service-writer-contact'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import { enrollLocationInProgram, getActiveEnrollment } from '@/lib/program-enrollment-service'

export type CompleteExpertAssistSignupInput = {
  locationId: string
  name: string
  email?: string | null
  phone?: string | null
  isOwner: boolean
  /** No-card A/B variant: enables consult without Stripe when eligible. */
  skipCard: boolean
  /** When true (default), ensure an expert_assist program enrollment exists. */
  enroll?: boolean
}

export type CompleteExpertAssistSignupResult = {
  locationId: string
  contactId: string
  approvedContactId: string | null
  enrollmentId: string | null
  consultEnabled: boolean
  enrollmentCreated: boolean
  activationVariant: ActivationVariant
}

export { activationVariantFromSkipCard }

export class CompleteExpertAssistSignupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CompleteExpertAssistSignupError'
  }
}

type LocationSignupRow = {
  id: string
  account_id: string | null
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_stripe_payment_method_id: string | null
  consult_first_free_used_at: string | null
}

export async function completeExpertAssistSignup(
  supabase: SupabaseClient,
  input: CompleteExpertAssistSignupInput,
): Promise<CompleteExpertAssistSignupResult> {
  const locationId = input.locationId.trim()
  const name = input.name.trim()
  if (!locationId) throw new CompleteExpertAssistSignupError('location_id is required', 400)
  if (!name) throw new CompleteExpertAssistSignupError('name is required', 400)

  const { data: loc, error: locError } = await supabase
    .from('locations')
    .select(
      'id, account_id, consult_enabled, consult_billing_status, consult_stripe_payment_method_id, consult_first_free_used_at',
    )
    .eq('id', locationId)
    .maybeSingle()

  if (locError) throw new CompleteExpertAssistSignupError(locError.message, 500)
  if (!loc) throw new CompleteExpertAssistSignupError('Location not found', 404)

  const row = loc as LocationSignupRow
  const { contactId, approvedContactId } = await upsertExpertAssistServiceWriter(supabase, {
    locationId,
    accountId: row.account_id,
    name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isOwner: input.isOwner,
  })

  let consultEnabled = Boolean(row.consult_enabled)

  if (input.skipCard && !consultEnabled) {
    const hypothetical = {
      consult_enabled: true,
      consult_billing_status: row.consult_billing_status,
      consult_stripe_payment_method_id: row.consult_stripe_payment_method_id,
      consult_first_free_used_at: row.consult_first_free_used_at,
    }
    if (!qualifiesForFreeConsultWithoutCard(hypothetical)) {
      throw new CompleteExpertAssistSignupError(
        'Shop cannot enable Expert Assist without a card (free consult already used or billing state incompatible)',
        409,
      )
    }

    const { error: enableError } = await supabase
      .from('locations')
      .update({ consult_enabled: true })
      .eq('id', locationId)

    if (enableError) throw new CompleteExpertAssistSignupError(enableError.message, 500)
    consultEnabled = true
  }

  let enrollmentId: string | null = null
  let enrollmentCreated = false

  if (input.enroll !== false) {
    const enrolled = await enrollLocationInProgram(supabase, {
      locationId,
      programId: EXPERT_ASSIST_PROGRAM_ID,
      actorId: 'signup',
    })
    enrollmentId = enrolled.enrollmentId
    enrollmentCreated = enrolled.created

    const now = new Date().toISOString()
    await supabase
      .from('location_program_enrollments')
      .update({ last_touched_at: now })
      .eq('id', enrollmentId)
  } else {
    const active = await getActiveEnrollment(supabase, {
      locationId,
      programId: EXPERT_ASSIST_PROGRAM_ID,
    })
    enrollmentId = active?.id ?? null
  }

  return {
    locationId,
    contactId,
    approvedContactId,
    enrollmentId,
    consultEnabled,
    enrollmentCreated,
    activationVariant: activationVariantFromSkipCard(input.skipCard),
  }
}
