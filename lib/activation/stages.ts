import type { ActivationStage, ActivationStageFacts } from '@/lib/activation/types'

export const ACTIVATION_ACTIVE_WINDOW_DAYS = 60

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isActivationStage(value: string): value is ActivationStage {
  return (
    value === 'invited' ||
    value === 'signed_up' ||
    value === 'engaged' ||
    value === 'activated' ||
    value === 'active' ||
    value === 'dormant'
  )
}

function daysBetween(earlierIso: string, laterIso: string): number {
  return (Date.parse(laterIso) - Date.parse(earlierIso)) / MS_PER_DAY
}

function daysSince(iso: string, nowMs: number): number {
  return (nowMs - Date.parse(iso)) / MS_PER_DAY
}

/**
 * Resolve the second closed consult timestamp from cached funnel facts.
 * When consult_count is exactly 2, last_consult_at is the second close.
 */
export function secondConsultAt(facts: ActivationStageFacts): string | null {
  if (facts.consult_count < 2) return null
  return facts.last_consult_at
}

export type ComputeStageOptions = {
  nowMs?: number
  /** When consult_count >= 3, last_consult_at alone may not satisfy the 60d first→second rule. */
  secondConsultAt?: string | null
}

/**
 * Derive funnel stage from activation_state facts.
 * Port of deriveExpertAssistFunnelStage using signed_up_at / first_inbound_at / consult facts.
 */
export function computeStage(
  facts: ActivationStageFacts,
  opts?: ComputeStageOptions,
): ActivationStage {
  const nowMs = opts?.nowMs ?? Date.now()

  if (!facts.signed_up_at) return 'invited'

  if (facts.consult_count === 0) {
    if (facts.first_inbound_at) return 'engaged'
    return 'signed_up'
  }

  const lastClosed = facts.last_consult_at
  if (lastClosed && daysSince(lastClosed, nowMs) > ACTIVATION_ACTIVE_WINDOW_DAYS) {
    return 'dormant'
  }

  const firstClosed = facts.first_consult_at
  const secondClosed = opts?.secondConsultAt ?? secondConsultAt(facts)
  if (
    facts.consult_count >= 2 &&
    firstClosed &&
    secondClosed &&
    daysBetween(firstClosed, secondClosed) <= ACTIVATION_ACTIVE_WINDOW_DAYS &&
    lastClosed &&
    daysSince(lastClosed, nowMs) <= ACTIVATION_ACTIVE_WINDOW_DAYS
  ) {
    return 'active'
  }

  return 'activated'
}

export function isFirstTransitionToActive(
  previousStage: ActivationStage | string | null,
  stage: ActivationStage,
): boolean {
  return stage === 'active' && previousStage !== 'active'
}
