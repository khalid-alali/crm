import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldSendDripStep as shouldSendDripStepDb } from '@/lib/activation/drip'
import { logShopEvent as logShopEventDb, sendOnce as sendOnceDb } from '@/lib/activation/events'
import {
  incrementCounter as incrementCounterDb,
  setFirstInboundIfNull as setFirstInboundIfNullDb,
  setSmsChannelDead as setSmsChannelDeadDb,
  writeConsultFacts as writeConsultFactsDb,
  writeFactIfNull as writeFactIfNullDb,
} from '@/lib/activation/facts'
import { recomputeStage as recomputeStageDb } from '@/lib/activation/recompute'
import {
  ensureActivationState as ensureActivationStateDb,
  getState as getStateDb,
  getStateOrThrow as getStateOrThrowDb,
} from '@/lib/activation/state'
import type {
  ActivationStateView,
  ActivationTimestampField,
  ActivationVariant,
  DripStep,
  LogShopEventResult,
  RecomputeStageResult,
} from '@/lib/activation/types'
import { supabaseAdmin } from '@/lib/supabase'

export async function ensureActivationState(
  locationId: string,
  opts?: { activationVariant?: ActivationVariant; isHighValue?: boolean },
) {
  return ensureActivationStateDb(supabaseAdmin, locationId, opts)
}

export async function getState(locationId: string): Promise<ActivationStateView | null>
export async function getState(
  supabase: SupabaseClient,
  locationId: string,
): Promise<ActivationStateView | null>
export async function getState(
  supabaseOrLocationId: SupabaseClient | string,
  maybeLocationId?: string,
): Promise<ActivationStateView | null> {
  if (typeof supabaseOrLocationId === 'string') {
    return getStateDb(supabaseAdmin, supabaseOrLocationId)
  }
  return getStateDb(supabaseOrLocationId, maybeLocationId!)
}

export async function getStateOrThrow(locationId: string) {
  return getStateOrThrowDb(supabaseAdmin, locationId)
}

export async function recomputeStage(
  locationId: string,
  opts?: { nowMs?: number },
): Promise<RecomputeStageResult | null>
export async function recomputeStage(
  supabase: SupabaseClient,
  locationId: string,
  opts?: { nowMs?: number },
): Promise<RecomputeStageResult | null>
export async function recomputeStage(
  supabaseOrLocationId: SupabaseClient | string,
  locationIdOrOpts?: string | { nowMs?: number },
  optsMaybe?: { nowMs?: number },
): Promise<RecomputeStageResult | null> {
  if (typeof supabaseOrLocationId === 'string') {
    const opts = typeof locationIdOrOpts === 'object' ? locationIdOrOpts : optsMaybe
    return recomputeStageDb(supabaseAdmin, supabaseOrLocationId, opts)
  }
  return recomputeStageDb(
    supabaseOrLocationId,
    locationIdOrOpts as string,
    optsMaybe,
  )
}

export async function writeFactIfNull(
  locationId: string,
  field: ActivationTimestampField,
  timestamp: string,
) {
  return writeFactIfNullDb(supabaseAdmin, locationId, field, timestamp)
}

export async function incrementCounter(
  locationId: string,
  field: 'consult_count' | 'referral_count' | 'qr_scan_count',
) {
  return incrementCounterDb(supabaseAdmin, locationId, field)
}

export async function logShopEvent(
  locationId: string,
  eventType: string,
  dedupeKey: string,
  payload: Record<string, unknown> = {},
): Promise<LogShopEventResult> {
  return logShopEventDb(supabaseAdmin, locationId, eventType, dedupeKey, payload)
}

export async function sendOnce(
  locationId: string,
  dedupeKey: string,
  sendFn: () => Promise<void>,
  payload: Record<string, unknown> = {},
) {
  return sendOnceDb(supabaseAdmin, locationId, dedupeKey, sendFn, payload)
}

export async function shouldSendDripStep(locationId: string, step: DripStep) {
  const state = await getState(locationId)
  if (!state) return false
  return shouldSendDripStepDb(supabaseAdmin, locationId, step, state)
}

export async function setFirstInboundIfNull(locationId: string, timestamp?: string) {
  return setFirstInboundIfNullDb(supabaseAdmin, locationId, timestamp)
}

export async function writeConsultFacts(locationId: string, consultId: string, closedAt: string) {
  return writeConsultFactsDb(supabaseAdmin, locationId, consultId, closedAt)
}

export async function setSmsChannelDead(locationId: string, dead: boolean) {
  return setSmsChannelDeadDb(supabaseAdmin, locationId, dead)
}
