import { calendarDaysSince } from '@/lib/labor-rate-approval/sla'

export type CronDayAction =
  | { kind: 'reminder_approvers'; day: number }
  | { kind: 'escalate'; day: number }
  | { kind: 'reminder_escalation'; day: number }
  | { kind: 'none' }

/** Map LA calendar day since submit to today's cron action. */
export function cronActionForDay(day: number, status: string): CronDayAction {
  if (status === 'escalated') {
    if (day === 10) return { kind: 'reminder_escalation', day }
    if (day >= 12) return { kind: 'reminder_escalation', day }
    return { kind: 'none' }
  }

  if (status === 'requested' || status === 'changes_requested') {
    if (day === 3) return { kind: 'reminder_approvers', day }
    if (day === 5 || day === 6) return { kind: 'reminder_approvers', day }
    if (day === 7) return { kind: 'escalate', day }
    return { kind: 'none' }
  }

  return { kind: 'none' }
}

export function cronActionForRow(
  submittedAt: string,
  status: string,
  now: Date = new Date(),
): CronDayAction {
  const day = calendarDaysSince(submittedAt, now)
  return cronActionForDay(day, status)
}
