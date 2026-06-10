import { getState, sendOnce } from '@/lib/activation/bindings'
import {
  sendPhotoReceivedOwnerEmail,
  sendPrintoutPhotoFrontDeskSms,
} from '@/lib/activation/emails'

export async function runHandlePhotoReceived(payload: {
  locationId: string
  dedupeKey: string
}): Promise<{ ok: boolean }> {
  const locationId = payload.locationId.trim()
  if (!locationId) throw new Error('locationId is required')

  const ctx = await getState(locationId)
  if (!ctx) return { ok: false }

  const dedupe = payload.dedupeKey.trim() || `photo:${locationId}`

  await sendOnce(locationId, `photo-front-desk:${dedupe}`, () => sendPrintoutPhotoFrontDeskSms(ctx))
  await sendOnce(locationId, `photo-owner:${dedupe}`, () => sendPhotoReceivedOwnerEmail(ctx))

  return { ok: true }
}
