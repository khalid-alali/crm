import {
  ensureActivationState,
  incrementCounter,
  logShopEvent,
  recomputeStage,
  writeFactIfNull,
} from '@/lib/activation/bindings'
import { triggerHandlePhotoReceived, triggerHandleReferral } from '@/lib/activation/trigger'
import { toolboxDiagnoseUrl } from '@/lib/activation/urls'
import { supabaseAdmin } from '@/lib/supabase'

const CONSUMER_ID_PARAMS = ['consult_short_code', 'shortCode', 'shop_code', 'shopCode'] as const

export function rejectConsumerShortCodeParams(searchParams: URLSearchParams): string | null {
  for (const key of CONSUMER_ID_PARAMS) {
    const value = searchParams.get(key)?.trim()
    if (value) return key
  }
  return null
}

async function resolveLocationIdByCasePartner(casePartner: string): Promise<string | null> {
  const code = casePartner.trim().toUpperCase()
  if (!code) return null

  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('toolbox_case_partner', code)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as { id: string } | null)?.id ?? null
}

export async function recordQrScan(input: {
  casePartner: string
  src?: string | null
}): Promise<{ locationId: string; redirectUrl: string } | null> {
  const casePartner = input.casePartner.trim().toUpperCase()
  if (!casePartner) return null

  const locationId = await resolveLocationIdByCasePartner(casePartner)
  if (!locationId) return null

  await ensureActivationState(locationId)
  const scanCount = await incrementCounter(locationId, 'qr_scan_count')
  const now = new Date().toISOString()
  await writeFactIfNull(locationId, 'qr_first_scanned_at', now)

  await logShopEvent(locationId, 'qr.scanned', `scan:${scanCount}`, {
    casePartner,
    src: input.src?.trim() || null,
    scanCount,
  })

  await recomputeStage(locationId)

  const src = input.src?.trim()
  const utmMedium = src === 'card' ? 'counter_card' : src || 'qr'
  return {
    locationId,
    redirectUrl: toolboxDiagnoseUrl(casePartner, { utmSource: 'qr', utmMedium }),
  }
}

export async function recordOwnerForwardClick(
  locationId: string,
  dedupeKey: string,
): Promise<boolean> {
  await ensureActivationState(locationId)
  const now = new Date().toISOString()
  const wrote = await writeFactIfNull(locationId, 'owner_forward_clicked_at', now)
  const logged = await logShopEvent(locationId, 'email.forward_clicked', dedupeKey, {
    locationId,
  })
  if (wrote) await recomputeStage(locationId)
  return wrote || logged.inserted
}

export async function recordCounterCardDownload(locationId: string): Promise<void> {
  await ensureActivationState(locationId)
  const now = new Date().toISOString()
  const wrote = await writeFactIfNull(locationId, 'counter_card_downloaded_at', now)
  await logShopEvent(locationId, 'asset.counter_card_downloaded', `download:${now.slice(0, 10)}`, {})
  if (wrote) await recomputeStage(locationId)
}

export async function recordPrintoutPhotoReceived(
  locationId: string,
  dedupeKey: string,
): Promise<boolean> {
  await ensureActivationState(locationId)
  const now = new Date().toISOString()
  const wrote = await writeFactIfNull(locationId, 'printout_photo_received_at', now)
  if (!wrote) return false

  await logShopEvent(locationId, 'printout.photo_received', dedupeKey, {})
  await recomputeStage(locationId)
  await triggerHandlePhotoReceived({ locationId, dedupeKey })
  return true
}

async function writeReferralFacts(locationId: string, referralId: string, at: string): Promise<void> {
  await ensureActivationState(locationId)
  await writeFactIfNull(locationId, 'first_referral_at', at)

  const { error } = await supabaseAdmin
    .from('activation_state')
    .update({ last_referral_at: at })
    .eq('location_id', locationId)

  if (error) throw new Error(error.message)
  await incrementCounter(locationId, 'referral_count')
  await logShopEvent(locationId, 'referral.submitted', referralId, { referralId })
}

export async function recordReferralSubmitted(input: {
  casePartner: string
  referralId: string
}): Promise<{ ok: boolean; locationId?: string; reason?: string }> {
  const referralId = input.referralId.trim()
  if (!referralId) return { ok: false, reason: 'referral_id_required' }

  const locationId = await resolveLocationIdByCasePartner(input.casePartner)
  if (!locationId) return { ok: false, reason: 'unknown_case_partner' }

  const at = new Date().toISOString()
  await writeReferralFacts(locationId, referralId, at)
  await recomputeStage(locationId)
  return { ok: true, locationId }
}

export async function recordReferralBooked(input: {
  casePartner: string
  referralId: string
}): Promise<{ ok: boolean; locationId?: string; reason?: string }> {
  const referralId = input.referralId.trim()
  if (!referralId) return { ok: false, reason: 'referral_id_required' }

  const locationId = await resolveLocationIdByCasePartner(input.casePartner)
  if (!locationId) return { ok: false, reason: 'unknown_case_partner' }

  const at = new Date().toISOString()
  await writeReferralFacts(locationId, referralId, at)
  await logShopEvent(locationId, 'referral.booked', referralId, { referralId })
  await recomputeStage(locationId)
  await triggerHandleReferral({ locationId, referralId })
  return { ok: true, locationId }
}
