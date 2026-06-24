import {
  VINFAST_PROGRAM_ID,
  getProgramConfig,
  type ChecklistPrerequisite,
  type ProgramChecklistItem,
} from '@/lib/program-config'

/** Canonical checklist key → legacy `program_enrollment_checklist.item_key` values (read-only merge). */
export const VINFAST_CHECKLIST_LEGACY_ITEM_KEYS: Record<string, string[]> = {
  technical_training_scheduled: ['vf_technical_training_scheduled'],
  conduct_portal_walkthrough: ['portal_walkthrough'],
  vf_dealer_portal_account_created: ['vf_dealer_portal_stp_address'],
  vci_shipped: ['vf_vci_shipped'],
  dsa_vdsa_account_requested: ['dsa_vdsa_requested'],
  add_shop_to_quickbooks_and_routable: ['quickbooks_and_routable'],
  stock_parts_order_placed: ['stock_parts_order'],
  shop_has_full_access_and_charger: ['dsa_vdsa_portal_charger_ready', 'dsa_vdsa_activated'],
  shop_activated: ['shop_activated_vf'],
  vinfast_notified_of_activation: ['vinfast_notified'],
  month_1_check_in: ['month_1_checkin_done'],
  month_2_check_in: ['month_2_checkin_done'],
  vf_notified_of_operational_status: ['vf_notified'],
}

export type VinfastChecklistRow = {
  item_key: string
  completed_at: string | null
  completed_by_user_id?: string | null
  notes?: string | null
}

export type VinfastCompletionContext = {
  rowsByKey: Map<string, VinfastChecklistRow>
  routablePaymentMethodCount: number
  vfGoLiveWeek: string | null | undefined
  firstJobCompletedAt: string | null | undefined
  /** From `shop_status_cache.vinfast_store_code` when admin shop is linked. */
  vinfastStoreCode: string | null | undefined
}

export function hasVinfastStoreCode(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function rowForCanonicalKey(
  canonicalKey: string,
  rowsByKey: Map<string, VinfastChecklistRow>,
): VinfastChecklistRow | undefined {
  const legacy = VINFAST_CHECKLIST_LEGACY_ITEM_KEYS[canonicalKey] ?? []
  for (const k of [canonicalKey, ...legacy]) {
    const row = rowsByKey.get(k)
    if (row) return row
  }
  return undefined
}

/** Effective completion time for stage derivation, prerequisites, and UI (includes virtual/auto rows). */
export function getVinfastEffectiveCompletedAt(
  itemKey: string,
  def: ProgramChecklistItem | undefined,
  ctx: VinfastCompletionContext,
): string | null {
  const row = rowForCanonicalKey(itemKey, ctx.rowsByKey)
  if (row?.completed_at) return row.completed_at

  if (itemKey === 'routable_payout_method_linked') {
    const n = ctx.routablePaymentMethodCount
    if (Number.isFinite(n) && n > 0) return new Date().toISOString()
  }
  if (itemKey === 'go_live_week_set') {
    const w = ctx.vfGoLiveWeek
    if (typeof w === 'string' && w.trim()) return new Date().toISOString()
  }
  if (itemKey === 'first_booking_received') {
    const j = ctx.firstJobCompletedAt
    if (typeof j === 'string' && j.trim() && !Number.isNaN(Date.parse(j))) return j
  }
  if (itemKey === 'dealer_code_in_admin') {
    if (hasVinfastStoreCode(ctx.vinfastStoreCode)) return new Date().toISOString()
  }

  return null
}

function formatPrereqOpenDate(isoMs: number): string {
  return new Date(isoMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function phaseHeading(phaseItems: ProgramChecklistItem[]): string {
  const ph = phaseItems[0]?.phase
  const label = phaseItems[0]?.phaseLabel
  if (ph != null && label) return `Phase ${ph} · ${label}`
  return 'Phase'
}

export function evaluateVinfastPrerequisites(
  _item: ProgramChecklistItem,
  prereqs: ChecklistPrerequisite[] | undefined,
  completedAtByKey: Map<string, string | null>,
  itemsByPhase: Map<number, ProgramChecklistItem[]>,
  labelByKey: Map<string, string>,
  nowMs: number,
): { satisfied: boolean; waitingOn: string[] } {
  if (!prereqs?.length) return { satisfied: true, waitingOn: [] }

  const waitingOn: string[] = []

  for (const p of prereqs) {
    if (typeof p === 'string') {
      const t = completedAtByKey.get(p)
      if (!t) {
        waitingOn.push(labelByKey.get(p) ?? p)
      }
      continue
    }
    if ('phaseComplete' in p) {
      const phaseItems = itemsByPhase.get(p.phaseComplete) ?? []
      const incomplete = phaseItems.filter(it => !completedAtByKey.get(it.key))
      if (incomplete.length > 0) {
        waitingOn.push(`All ${phaseHeading(phaseItems)} checklist items complete`)
      }
      continue
    }
    if ('afterItem' in p) {
      const refKey = p.afterItem
      const refAt = completedAtByKey.get(refKey)
      const refLabel = labelByKey.get(refKey) ?? refKey
      if (!refAt) {
        waitingOn.push(refLabel)
        continue
      }
      const dueMs = new Date(refAt).getTime() + p.delayDays * 86_400_000
      if (nowMs < dueMs) {
        waitingOn.push(
          `${p.delayDays}-day wait after “${refLabel}” (actionable ${formatPrereqOpenDate(dueMs)})`,
        )
      }
    }
  }

  return { satisfied: waitingOn.length === 0, waitingOn }
}

export function buildVinfastChecklistMaps(checklist: ProgramChecklistItem[]) {
  const itemsByPhase = new Map<number, ProgramChecklistItem[]>()
  const labelByKey = new Map<string, string>()
  for (const item of checklist) {
    if (item.phase == null) continue
    const list = itemsByPhase.get(item.phase) ?? []
    list.push(item)
    itemsByPhase.set(item.phase, list)
    labelByKey.set(item.key, item.label)
  }
  for (const [, list] of itemsByPhase) {
    list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  }
  return { itemsByPhase, labelByKey }
}

export function vinfastChecklistDefinitions(): ProgramChecklistItem[] {
  const config = getProgramConfig(VINFAST_PROGRAM_ID)
  return (config?.checklist ?? []).filter(item => item.phase && item.phaseLabel && item.owner)
}

/** Phase header progress: when `showBlocked` is false, denominator excludes incomplete items that are still prerequisite-blocked. */
export function vinfastPhaseProgress(input: {
  phaseItems: Array<{ completedAt: string | null; blockedIncomplete: boolean }>
  showBlocked: boolean
}): { done: number; total: number } {
  const { phaseItems, showBlocked } = input
  const done = phaseItems.filter(i => Boolean(i.completedAt)).length
  const total = showBlocked
    ? phaseItems.length
    : phaseItems.filter(i => Boolean(i.completedAt) || !i.blockedIncomplete).length
  return { done, total }
}
