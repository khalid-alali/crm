import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createRoutableEmbeddedInvite,
  retrieveRoutableCompany,
  routableCredentialsFromEnv,
  type RoutableCompany,
  type RoutableCredentials,
} from '@/lib/routable'
import { buildEnrollmentPortalHref } from '@/lib/email-template-placeholders'

export type BankLinkState = 'not_started' | 'in_progress' | 'finishing' | 'linked' | 'waiting_setup'

export type RoutableLocationRow = {
  id: string
  routable_id: string | null
  routable_status: string | null
  routable_payment_method_count: number | null
  routable_account_last4: string | null
  routable_link_started_at: string | null
  portal_unlocked_at: string | null
  pm_last_checked_at: string | null
  last_routable_link_sent_at: string | null
  routable_enrolled_at?: string | null
}

export type BankGateSnapshot = {
  state: BankLinkState
  unlocked: boolean
  routableId: string | null
  routableStatus: string | null
  paymentMethodCount: number
  accountLast4: string | null
  linkStartedAt: string | null
  portalUnlockedAt: string | null
}

const FIFTEEN_DAYS_MS = 15 * 86_400_000

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isRoutableBankLinked(row: Pick<RoutableLocationRow, 'routable_payment_method_count' | 'routable_status' | 'portal_unlocked_at'>): boolean {
  if (row.portal_unlocked_at) return true
  if (Number(row.routable_payment_method_count ?? 0) > 0) return true
  return cleanText(row.routable_status).toLowerCase() === 'accepted'
}

export function deriveBankLinkState(
  row: RoutableLocationRow,
  opts?: { returningFromFlow?: boolean },
): BankLinkState {
  if (isRoutableBankLinked(row)) return 'linked'

  const routableId = cleanText(row.routable_id)
  if (!routableId) return 'waiting_setup'

  const status = cleanText(row.routable_status).toLowerCase()
  if (opts?.returningFromFlow && status !== 'accepted') return 'finishing'
  if (row.routable_link_started_at || status === 'invited') return 'in_progress'
  return 'not_started'
}

export function snapshotFromLocation(row: RoutableLocationRow, opts?: { returningFromFlow?: boolean }): BankGateSnapshot {
  const unlocked = isRoutableBankLinked(row)
  return {
    state: deriveBankLinkState(row, opts),
    unlocked,
    routableId: cleanText(row.routable_id) || null,
    routableStatus: cleanText(row.routable_status) || null,
    paymentMethodCount: Number(row.routable_payment_method_count ?? 0),
    accountLast4: cleanText(row.routable_account_last4) || null,
    linkStartedAt: row.routable_link_started_at,
    portalUnlockedAt: row.portal_unlocked_at,
  }
}

/** Backoff interval before the next Routable status poll. */
export function routablePollIntervalMs(row: Pick<RoutableLocationRow, 'routable_link_started_at' | 'last_routable_link_sent_at'>, nowMs = Date.now()): number {
  const startedAtRaw = row.routable_link_started_at ?? row.last_routable_link_sent_at
  if (!startedAtRaw) return 60 * 60_000
  const startedMs = new Date(startedAtRaw).getTime()
  if (Number.isNaN(startedMs)) return 60 * 60_000
  const elapsed = Math.max(0, nowMs - startedMs)
  if (elapsed < 10 * 60_000) return 30_000
  if (elapsed < 60 * 60_000) return 5 * 60_000
  return 60 * 60_000
}

export function shouldPollRoutableLocation(row: RoutableLocationRow, nowMs = Date.now()): boolean {
  if (isRoutableBankLinked(row)) return false
  if (!cleanText(row.routable_id)) return false

  const anchor = row.routable_link_started_at ?? row.last_routable_link_sent_at ?? row.routable_enrolled_at
  if (anchor) {
    const anchorMs = new Date(anchor).getTime()
    if (!Number.isNaN(anchorMs) && nowMs - anchorMs > FIFTEEN_DAYS_MS) return false
  }

  if (!row.pm_last_checked_at) return true
  const lastMs = new Date(row.pm_last_checked_at).getTime()
  if (Number.isNaN(lastMs)) return true
  return nowMs - lastMs >= routablePollIntervalMs(row, nowMs)
}

export function buildBankLinkConfirmationUrl(portalBaseUrl: string, portalToken: string): string {
  const onboardingHref = buildEnrollmentPortalHref(portalBaseUrl, portalToken)
  return `${onboardingHref}?bank_link=return`
}

export type SyncRoutableResult = {
  company: RoutableCompany
  linkedNow: boolean
  unlockedNow: boolean
}

export async function syncRoutableLocationFromApi(
  admin: SupabaseClient,
  locationId: string,
  creds: RoutableCredentials,
  companyId: string,
  previous: RoutableLocationRow,
): Promise<SyncRoutableResult> {
  const company = await retrieveRoutableCompany(creds, companyId)
  const nowIso = new Date().toISOString()
  const wasLinked = isRoutableBankLinked(previous)
  const isLinked =
    company.paymentMethodCount > 0 || cleanText(company.status).toLowerCase() === 'accepted'

  const patch: Record<string, unknown> = {
    routable_status: company.status,
    routable_payment_method_count: company.paymentMethodCount,
    routable_account_last4: company.accountLast4,
    pm_last_checked_at: nowIso,
  }
  if (isLinked && !previous.portal_unlocked_at) {
    patch.portal_unlocked_at = nowIso
  }

  const { error } = await admin.from('locations').update(patch).eq('id', locationId)
  if (error) throw new Error(error.message)

  const linkedNow = !wasLinked && isLinked
  if (linkedNow) {
    await admin.from('activity_log').insert({
      location_id: locationId,
      type: 'routable_bank_linked',
      subject: 'Routable payout method linked',
      body: `Bank account linked via Routable (status: ${company.status ?? 'unknown'}, methods: ${company.paymentMethodCount}).`,
      sent_by: 'system',
    })
  }

  return {
    company,
    linkedNow,
    unlockedNow: linkedNow,
  }
}

export async function startEmbeddedBankLinkFlow(input: {
  admin: SupabaseClient
  location: RoutableLocationRow
  portalBaseUrl: string
  portalToken: string
  creds?: RoutableCredentials | null
}): Promise<{ externalFlowUrl: string; snapshot: BankGateSnapshot }> {
  const creds = input.creds ?? routableCredentialsFromEnv()
  if (!creds) throw new Error('Routable is not configured')

  const companyId = cleanText(input.location.routable_id)
  if (!companyId) throw new Error('Your Fixlane account is still being set up. Check back soon or contact onboarding@fixlane.com.')

  const confirmationRedirectUrl = buildBankLinkConfirmationUrl(input.portalBaseUrl, input.portalToken)
  const invite = await createRoutableEmbeddedInvite(creds, companyId, confirmationRedirectUrl)
  const startedAt = new Date().toISOString()

  const { error } = await input.admin
    .from('locations')
    .update({
      routable_link_started_at: startedAt,
      last_routable_link_sent_at: startedAt,
      routable_status: invite.companyStatus ?? 'invited',
    })
    .eq('id', input.location.id)
  if (error) throw new Error(error.message)

  const updated: RoutableLocationRow = {
    ...input.location,
    routable_link_started_at: startedAt,
    last_routable_link_sent_at: startedAt,
    routable_status: invite.companyStatus ?? 'invited',
  }

  return {
    externalFlowUrl: invite.externalFlowUrl,
    snapshot: snapshotFromLocation(updated),
  }
}

export const ROUTABLE_LOCATION_SELECT =
  'id, routable_id, routable_status, routable_payment_method_count, routable_account_last4, routable_link_started_at, portal_unlocked_at, pm_last_checked_at, last_routable_link_sent_at, routable_enrolled_at'
