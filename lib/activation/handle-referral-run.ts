import { getState, sendOnce } from '@/lib/activation/bindings'
import { sendReferralBookedOwnerEmail } from '@/lib/activation/emails'

export async function runHandleReferral(payload: {
  locationId: string
  referralId: string
}): Promise<{ ok: boolean }> {
  const locationId = payload.locationId.trim()
  const referralId = payload.referralId.trim()
  if (!locationId || !referralId) throw new Error('locationId and referralId are required')

  const ctx = await getState(locationId)
  if (!ctx) return { ok: false }

  await sendOnce(locationId, `referral-booked-email:${referralId}`, () =>
    sendReferralBookedOwnerEmail(ctx, referralId),
  )

  return { ok: true }
}
