import type { ConsultQueueRow } from '@/lib/expert-assist/types'

export type BallCourt = 'expert' | 'shop'
export type QueuePillKind = 'new' | 'shop_replied' | 'awaiting_shop'
export type QueueFilter = 'all' | 'need_response' | 'awaiting_shop' | 'timer_20m'
export type TimerVisualState = 'idle' | 'running' | 'warn' | 'danger'

const WARN_TIMER_SECONDS = 18 * 60
const DANGER_TIMER_SECONDS = 60 * 60
const TIMER_CHIP_SECONDS = 20 * 60

/** Stable short id for queue display (EA-####). */
export function formatConsultCaseId(id: string): string {
  const hex = id.replace(/-/g, '').slice(-8)
  const n = (parseInt(hex, 16) % 9000) + 1000
  return `EA-${n}`
}

export function getBallCourt(row: ConsultQueueRow): BallCourt {
  if (row.delivery_attention) return 'expert'
  if (!row.last_message_at) return 'expert'
  if (row.last_message_direction === 'inbound') return 'expert'
  return 'shop'
}

export function getQueuePill(row: ConsultQueueRow): QueuePillKind {
  if (getBallCourt(row) === 'shop') return 'awaiting_shop'
  if (!row.last_message_at) return 'new'
  if (row.last_message_direction === 'inbound') return 'shop_replied'
  return 'new'
}

/** Anchor for "how long has the ball been in this court?" */
export function waitAnchorIso(row: ConsultQueueRow): string {
  const court = getBallCourt(row)
  if (court === 'expert') {
    if (row.last_message_direction === 'inbound' && row.last_message_at) return row.last_message_at
    return row.created_at
  }
  return row.last_message_at ?? row.created_at
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatWaitMinutes(iso: string, nowMs = Date.now()): string {
  const ms = nowMs - new Date(iso).getTime()
  if (ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`
  }
  const d = Math.floor(m / 1440)
  return `${d}d`
}

/** Time-of-day if today, short date (e.g. May 14) if older. */
export function formatCreatedTime(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso)
  const now = new Date(nowMs)
  if (sameCalendarDay(d, now)) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function activeTimerSeconds(row: ConsultQueueRow, nowMs = Date.now()): number | null {
  if (!row.timer_started_at || row.timer_stopped_at) return null
  const start = new Date(row.timer_started_at).getTime()
  return Math.max(0, Math.floor((nowMs - start) / 1000))
}

export function formatTimerClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function getTimerVisualState(seconds: number | null): TimerVisualState {
  if (seconds === null) return 'idle'
  if (seconds >= DANGER_TIMER_SECONDS) return 'danger'
  if (seconds >= WARN_TIMER_SECONDS) return 'warn'
  return 'running'
}

export function matchesTimerChip(row: ConsultQueueRow, nowMs = Date.now()): boolean {
  const secs = activeTimerSeconds(row, nowMs)
  return secs !== null && secs >= TIMER_CHIP_SECONDS
}

/** First line of first inbound message; falls back to intake question. */
export function getQueueQuestionPreview(row: ConsultQueueRow): string {
  const inbound = row.first_inbound_preview?.trim()
  if (inbound) return firstLine(inbound)
  const intake = row.initial_question?.trim()
  if (intake) return firstLine(intake)
  return '—'
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim()
  return line || '—'
}

export function formatVehicleLabel(row: ConsultQueueRow): { model: string | null; year: string | null } {
  const raw = row.model?.trim() ?? null
  const model = raw ? raw.replace(/^tesla\s+/i, '').trim() || null : null
  const year = row.year?.trim() || null
  return { model, year }
}

export function partitionOpenCases(rows: ConsultQueueRow[]): {
  needResponse: ConsultQueueRow[]
  awaitingShop: ConsultQueueRow[]
} {
  const needResponse: ConsultQueueRow[] = []
  const awaitingShop: ConsultQueueRow[] = []
  for (const row of rows) {
    if (getBallCourt(row) === 'expert') needResponse.push(row)
    else awaitingShop.push(row)
  }
  needResponse.sort(
    (a, b) => new Date(waitAnchorIso(a)).getTime() - new Date(waitAnchorIso(b)).getTime()
  )
  awaitingShop.sort(
    (a, b) => new Date(waitAnchorIso(b)).getTime() - new Date(waitAnchorIso(a)).getTime()
  )
  return { needResponse, awaitingShop }
}

export function filterOpenCases(
  rows: ConsultQueueRow[],
  filter: QueueFilter,
  search: string,
  nowMs = Date.now()
): ConsultQueueRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter(row => {
    if (filter === 'need_response' && getBallCourt(row) !== 'expert') return false
    if (filter === 'awaiting_shop' && getBallCourt(row) !== 'shop') return false
    if (filter === 'timer_20m' && !matchesTimerChip(row, nowMs)) return false
    if (!q) return true
    const caseId = formatConsultCaseId(row.id).toLowerCase()
    const shop = row.shop?.name?.toLowerCase() ?? ''
    const vin = row.vin?.toLowerCase() ?? ''
    const question = getQueueQuestionPreview(row).toLowerCase()
    return caseId.includes(q) || shop.includes(q) || vin.includes(q) || question.includes(q)
  })
}
