export const EXPERT_ASSIST_FUNNEL_STAGES = [
  'invited',
  'signed_up',
  'engaged',
  'activated',
  'active',
  'dormant',
] as const

export type ExpertAssistFunnelStage = (typeof EXPERT_ASSIST_FUNNEL_STAGES)[number]

export function isExpertAssistFunnelStage(value: string): value is ExpertAssistFunnelStage {
  return EXPERT_ASSIST_FUNNEL_STAGES.includes(value as ExpertAssistFunnelStage)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ACTIVE_WINDOW_DAYS = 60

export type ExpertAssistFunnelSignals = {
  signupComplete: boolean
  hasInboundSms: boolean
  closedConsultCount: number
  firstClosedAt: string | null
  secondClosedAt: string | null
  lastClosedAt: string | null
}

export function isSignupComplete(input: {
  consultBillingStatus: string | null | undefined
  consultEnabled: boolean | null | undefined
}): boolean {
  if (input.consultEnabled === true) return true
  return (input.consultBillingStatus ?? '').trim().toLowerCase() === 'active'
}

function daysBetween(earlierIso: string, laterIso: string): number {
  return (Date.parse(laterIso) - Date.parse(earlierIso)) / MS_PER_DAY
}

function daysSince(iso: string, nowMs: number): number {
  return (nowMs - Date.parse(iso)) / MS_PER_DAY
}

export function deriveExpertAssistFunnelStage(
  signals: ExpertAssistFunnelSignals,
  opts?: { nowMs?: number; manualStageOverride?: boolean; storedStage?: string },
): ExpertAssistFunnelStage {
  const nowMs = opts?.nowMs ?? Date.now()

  if (
    opts?.manualStageOverride &&
    opts.storedStage &&
    isExpertAssistFunnelStage(opts.storedStage)
  ) {
    return opts.storedStage
  }

  if (!signals.signupComplete) return 'invited'

  if (signals.closedConsultCount === 0) {
    if (signals.hasInboundSms) return 'engaged'
    return 'signed_up'
  }

  const lastClosed = signals.lastClosedAt
  if (lastClosed && daysSince(lastClosed, nowMs) > ACTIVE_WINDOW_DAYS) {
    return 'dormant'
  }

  const firstClosed = signals.firstClosedAt
  const secondClosed = signals.secondClosedAt
  if (
    signals.closedConsultCount >= 2 &&
    firstClosed &&
    secondClosed &&
    daysBetween(firstClosed, secondClosed) <= ACTIVE_WINDOW_DAYS &&
    lastClosed &&
    daysSince(lastClosed, nowMs) <= ACTIVE_WINDOW_DAYS
  ) {
    return 'active'
  }

  return 'activated'
}
