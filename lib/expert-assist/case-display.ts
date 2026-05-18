import { computeConsultBillUsd } from '@/lib/expert-assist/billing'
import type { ConsultMessageRow, ConsultOutcome, ConsultQueueRow } from '@/lib/expert-assist/types'
import {
  activeTimerSeconds,
  formatConsultCaseId,
  formatTimerClock,
  formatVehicleLabel,
  formatWaitMinutes,
  getBallCourt,
  getQueuePill,
  waitAnchorIso,
  type QueuePillKind,
} from '@/lib/expert-assist/queue-display'

export const CANNED_RESPONSES = [
  {
    id: 'vin',
    label: 'Ask for VIN',
    template: 'Can you send the full 17-character VIN when you have a moment? That will help us confirm the vehicle details.',
  },
  {
    id: 'photo',
    label: 'Send photo of fault screen',
    template:
      'When you can, please send a photo of the fault screen or alert on the center display — that will help narrow this down.',
  },
  {
    id: 'toolbox',
    label: 'Refer to Toolbox',
    template:
      'This looks like a good candidate for Toolbox diagnostics. I can point you to the right procedure if you want to pull it up on your end.',
  },
  {
    id: 'wrap',
    label: 'Wrapping up — anything else?',
    template: 'Glad we could help on this one. Anything else you need before we wrap up?',
  },
] as const

export const OUTCOME_GRID: {
  value: ConsultOutcome
  title: string
  subtitle: string
}[] = [
  { value: 'resolved_on_call', title: 'Resolved', subtitle: 'Question answered' },
  { value: 'recommended_toolbox', title: 'Toolbox referral', subtitle: 'Needs full diag' },
  { value: 'no_show', title: 'No contact', subtitle: 'Shop went dark' },
  { value: 'out_of_scope', title: 'Out of scope', subtitle: 'Not a Tesla issue' },
]

const FIRST_TIER_SECONDS = 20 * 60

export function deriveCaseTitle(caseRow: ConsultQueueRow, messages: ConsultMessageRow[]): string {
  const inbound =
    messages.find(m => m.direction === 'inbound' && m.body?.trim())?.body?.trim() ??
    caseRow.initial_question?.trim() ??
    'New consult'
  const { year, model } = formatVehicleLabel(caseRow)
  const issue = inbound.split(/[.!?\n]/)[0]?.trim() || inbound
  const shortIssue = issue.length > 50 ? `${issue.slice(0, 47)}…` : issue
  if (year && model) return `${shortIssue} on ${year} ${model}`
  return inbound.length > 80 ? `${inbound.slice(0, 77)}…` : inbound
}

export function getCasePillLabel(kind: QueuePillKind): string {
  if (kind === 'shop_replied') return 'Shop replied · needs response'
  if (kind === 'new') return 'New · needs response'
  if (kind === 'awaiting_shop') return 'Awaiting shop'
  return kind
}

export function getBallCourtStatusLabel(row: ConsultQueueRow): string {
  const pill = getQueuePill(row)
  if (pill === 'awaiting_shop') return 'Awaiting shop'
  if (pill === 'shop_replied') return 'Shop replied'
  return 'New'
}

export function totalBillableSeconds(row: ConsultQueueRow, nowMs = Date.now()): number {
  const base = row.billable_seconds ?? 0
  const active = activeTimerSeconds(row, nowMs)
  return base + (active ?? 0)
}

export function isTimerRunning(row: ConsultQueueRow, nowMs = Date.now()): boolean {
  return activeTimerSeconds(row, nowMs) !== null
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDayDividerLabel(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso)
  const now = new Date(nowMs)
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  const datePart = d.toLocaleDateString([], { month: 'long', day: 'numeric' })
  if (sameDay) return `Today, ${datePart}`
  if (isYesterday) return `Yesterday, ${datePart}`
  return datePart
}

export type TranscriptItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: ConsultMessageRow }

export function buildTranscriptItems(messages: ConsultMessageRow[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let lastDay: string | null = null
  for (const m of messages) {
    const dayKey = new Date(m.created_at).toDateString()
    if (dayKey !== lastDay) {
      items.push({ type: 'day', key: `day-${dayKey}`, label: formatDayDividerLabel(m.created_at) })
      lastDay = dayKey
    }
    items.push({ type: 'message', key: m.id, message: m })
  }
  return items
}

export function formatDeliveryReceipt(status: string): string {
  const s = status.toLowerCase()
  if (s === 'read' || s === 'read_receipt') return 'Delivered · Read'
  if (s === 'delivered') return 'Delivered'
  if (s === 'sent') return 'Sent'
  if (s === 'failed' || s === 'undelivered') return 'Failed'
  return status
}

export function countActivity(messages: ConsultMessageRow[]): { messages: number; calls: number } {
  const nonSystem = messages.filter(m => m.direction !== 'system').length
  const calls = messages.filter(
    m => m.direction === 'system' && /call/i.test(m.body ?? '')
  ).length
  return { messages: nonSystem, calls }
}

export function formatBillingBreakdown(billableSeconds: number): {
  timeLabel: string
  baseLabel: string
  overageLabel: string
  totalLabel: string
  billableWarn: boolean
} {
  const bill = computeConsultBillUsd(billableSeconds)
  const baseCents = 6000
  const overageCents = Math.max(0, bill.cents - baseCents)
  const overageUsd = (overageCents / 100).toFixed(2)
  return {
    timeLabel: formatTimerClock(billableSeconds),
    baseLabel: '$60.00',
    overageLabel: `$${overageUsd}`,
    totalLabel: bill.label,
    billableWarn: billableSeconds >= 18 * 60,
  }
}

export function timerProgressPercent(billableSeconds: number): number {
  return Math.min(100, (billableSeconds / FIRST_TIER_SECONDS) * 100)
}

export function formatCaseMeta(caseRow: ConsultQueueRow, nowMs = Date.now()) {
  const displayId = formatConsultCaseId(caseRow.id)
  const court = getBallCourt(caseRow)
  const wait = formatWaitMinutes(waitAnchorIso(caseRow), nowMs)
  return {
    displayId,
    createdTime: formatMessageTime(caseRow.created_at),
    waitingLabel: wait,
    waitingAction: court === 'expert',
  }
}

export function vehicleHeadline(caseRow: ConsultQueueRow): string | null {
  const { year, model } = formatVehicleLabel(caseRow)
  if (!year && !model) return null
  const parts = [year, model ? `Tesla ${model}` : null].filter(Boolean)
  return parts.join(' ')
}

export function vehicleSubline(caseRow: ConsultQueueRow): string {
  const trim = caseRow.trim?.trim()
  if (trim) return `${trim} · Parsed from inbound`
  if (caseRow.year || caseRow.model) return 'Parsed from inbound'
  return 'No vehicle detected yet'
}
