import { activationFieldForChecklistKey } from '@/lib/activation/checklist'
import { computeStage } from '@/lib/activation/stages'
import { isSignupComplete } from '@/lib/expert-assist-funnel/stages'
import type { ActivationStage, ActivationVariant } from '@/lib/activation/types'

export type BackfillLocationRow = {
  id: string
  consult_enabled: boolean | null
  consult_billing_status: string | null
  consult_first_free_used_at: string | null
  consult_stripe_payment_method_id: string | null
  toolbox_case_partner: string | null
  consult_invited_at: string | null
}

export type BackfillEnrollmentRow = {
  id: string
  location_id: string
  created_at: string
  stage: string
}

export type BackfillChecklistRow = {
  enrollment_id: string
  item_key: string
  completed_at: string | null
}

export type BackfillClosedCaseRow = {
  shop_id: string
  closed_at: string
}

export type BackfillInboundMessageRow = {
  shop_id: string
  created_at: string
}

export type ActivationSeedPayload = {
  location_id: string
  card_added_at: string | null
  owner_forward_clicked_at: string | null
  service_writer_setup_email_sent_at: string | null
  counter_card_downloaded_at: string | null
  welcome_kit_shipped_at: string | null
  printout_photo_received_at: string | null
  qr_first_scanned_at: string | null
  free_consult_used_at: string | null
  signed_up_at: string | null
  first_inbound_at: string | null
  first_consult_at: string | null
  last_consult_at: string | null
  consult_count: number
  first_referral_at: string | null
  referral_count: number
  last_referral_at: string | null
  activation_variant: ActivationVariant
  is_high_value: boolean
  sms_channel_dead: boolean
  qr_scan_count: number
  stage: ActivationStage
}

export type BuildActivationSeedInput = {
  location: BackfillLocationRow
  enrollment: BackfillEnrollmentRow
  checklistRows: BackfillChecklistRow[]
  closedCases: BackfillClosedCaseRow[]
  inboundMessages: BackfillInboundMessageRow[]
  nowMs?: number
}

function pickEarlier(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return Date.parse(a) <= Date.parse(b) ? a : b
}

export function inferActivationVariant(location: BackfillLocationRow): ActivationVariant {
  const hasCard = Boolean(location.consult_stripe_payment_method_id?.trim())
  if (hasCard) return 'card_required'

  if (location.consult_enabled === true) {
    const status = (location.consult_billing_status ?? '').trim().toLowerCase()
    if (status === 'not_setup' || status === 'pending' || status === '') {
      return 'card_after_first_consult'
    }
  }

  return 'card_required'
}

export function buildChecklistTimestamps(checklistRows: BackfillChecklistRow[]): {
  timestamps: Partial<Record<keyof ActivationSeedPayload, string | null>>
  qrScanCountFromChecklist: number
} {
  const timestamps: Partial<Record<keyof ActivationSeedPayload, string | null>> = {}

  for (const row of checklistRows) {
    const field = activationFieldForChecklistKey(row.item_key)
    if (!field || !row.completed_at) continue
    const key = field as keyof ActivationSeedPayload
    timestamps[key] = pickEarlier(timestamps[key] as string | null | undefined, row.completed_at)
  }

  return {
    timestamps,
    qrScanCountFromChecklist: timestamps.qr_first_scanned_at ? 1 : 0,
  }
}

export function buildClosedConsultFacts(closedCases: BackfillClosedCaseRow[]): {
  consult_count: number
  first_consult_at: string | null
  last_consult_at: string | null
} {
  const dates = closedCases
    .map(row => row.closed_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))

  return {
    consult_count: dates.length,
    first_consult_at: dates[0] ?? null,
    last_consult_at: dates[dates.length - 1] ?? null,
  }
}

export function buildFirstInboundAt(inboundMessages: BackfillInboundMessageRow[]): string | null {
  let earliest: string | null = null
  for (const row of inboundMessages) {
    if (!row.created_at) continue
    earliest = pickEarlier(earliest, row.created_at)
  }
  return earliest
}

export function buildActivationSeed(input: BuildActivationSeedInput): ActivationSeedPayload {
  const { location, enrollment, checklistRows, closedCases, inboundMessages } = input
  const { timestamps: checklist, qrScanCountFromChecklist } = buildChecklistTimestamps(checklistRows)
  const consultFacts = buildClosedConsultFacts(closedCases)
  const firstInboundAt = buildFirstInboundAt(inboundMessages)

  const signupComplete = isSignupComplete({
    consultEnabled: location.consult_enabled,
    consultBillingStatus: location.consult_billing_status,
  })

  const signedUpAt = signupComplete ? enrollment.created_at : null

  const hasCardOnFile = Boolean(location.consult_stripe_payment_method_id?.trim())
  const cardAddedAt =
    (checklist.card_added_at as string | null | undefined) ??
    (hasCardOnFile ? signedUpAt ?? enrollment.created_at : null)

  const freeConsultUsedAt =
    (checklist.free_consult_used_at as string | null | undefined) ??
    location.consult_first_free_used_at ??
    consultFacts.first_consult_at

  const qrFirstScannedAt = (checklist.qr_first_scanned_at as string | null | undefined) ?? null
  const qrScanCount = qrScanCountFromChecklist > 0 ? qrScanCountFromChecklist : qrFirstScannedAt ? 1 : 0

  const seed: ActivationSeedPayload = {
    location_id: location.id,
    card_added_at: cardAddedAt,
    owner_forward_clicked_at: (checklist.owner_forward_clicked_at as string | null) ?? null,
    service_writer_setup_email_sent_at:
      (checklist.service_writer_setup_email_sent_at as string | null) ?? null,
    counter_card_downloaded_at: (checklist.counter_card_downloaded_at as string | null) ?? null,
    welcome_kit_shipped_at: (checklist.welcome_kit_shipped_at as string | null) ?? null,
    printout_photo_received_at: (checklist.printout_photo_received_at as string | null) ?? null,
    qr_first_scanned_at: qrFirstScannedAt,
    free_consult_used_at: freeConsultUsedAt,
    signed_up_at: signedUpAt,
    first_inbound_at: firstInboundAt,
    first_consult_at: consultFacts.first_consult_at,
    last_consult_at: consultFacts.last_consult_at,
    consult_count: consultFacts.consult_count,
    first_referral_at: null,
    referral_count: 0,
    last_referral_at: null,
    activation_variant: inferActivationVariant(location),
    is_high_value: false,
    sms_channel_dead: false,
    qr_scan_count: qrScanCount,
    stage: 'invited',
  }

  seed.stage = computeStage(
    {
      signed_up_at: seed.signed_up_at,
      first_inbound_at: seed.first_inbound_at,
      first_consult_at: seed.first_consult_at,
      last_consult_at: seed.last_consult_at,
      consult_count: seed.consult_count,
    },
    { nowMs: input.nowMs },
  )

  return seed
}
