import { describe, expect, it } from 'vitest'
import {
  calendarDaysSince,
  daysLeft,
  formatMonD,
  laDateKey,
  slaDueAt,
} from '@/lib/labor-rate-approval/sla'
import { cronActionForDay } from '@/lib/labor-rate-approval/cron-schedule'

describe('laDateKey', () => {
  it('returns LA calendar date for UTC instant', () => {
    expect(laDateKey('2026-06-02T07:00:00.000Z')).toBe('2026-06-02')
  })
})

describe('calendarDaysSince', () => {
  it('returns 0 on submit day', () => {
    const submitted = '2026-06-02T18:00:00.000Z'
    const now = new Date('2026-06-02T23:00:00.000Z')
    expect(calendarDaysSince(submitted, now)).toBe(0)
  })

  it('counts whole LA calendar days', () => {
    const submitted = '2026-06-02T18:00:00.000Z'
    const now = new Date('2026-06-05T10:00:00.000Z')
    expect(calendarDaysSince(submitted, now)).toBe(3)
  })
})

describe('daysLeft', () => {
  it('floors at zero after SLA window', () => {
    const submitted = '2026-06-01T12:00:00.000Z'
    const now = new Date('2026-06-15T12:00:00.000Z')
    expect(daysLeft(submitted, now)).toBe(0)
  })

  it('reflects remaining days in countdown', () => {
    const submitted = '2026-06-02T18:00:00.000Z'
    const now = new Date('2026-06-05T10:00:00.000Z')
    expect(daysLeft(submitted, now)).toBe(4)
  })
})

describe('slaDueAt', () => {
  it('is at least 7 LA calendar days after submit', () => {
    const submitted = new Date('2026-06-02T18:00:00.000Z')
    const due = slaDueAt(submitted)
    expect(due.getTime()).toBeGreaterThan(submitted.getTime())
    const daySpan = calendarDaysSince(submitted.toISOString(), due)
    expect(daySpan).toBeGreaterThanOrEqual(7)
  })
})

describe('formatMonD', () => {
  it('formats in LA timezone', () => {
    const formatted = formatMonD('2026-06-02T18:00:00.000Z')
    expect(formatted).toMatch(/Jun/)
    expect(formatted).toMatch(/2/)
  })
})

describe('cronActionForDay', () => {
  it('reminds approvers on day 3 and 5', () => {
    expect(cronActionForDay(3, 'requested').kind).toBe('reminder_approvers')
    expect(cronActionForDay(5, 'requested').kind).toBe('reminder_approvers')
  })

  it('escalates on day 7 when still requested', () => {
    expect(cronActionForDay(7, 'requested').kind).toBe('escalate')
  })

  it('reminds escalation contact from day 10 and 12+', () => {
    expect(cronActionForDay(10, 'escalated').kind).toBe('reminder_escalation')
    expect(cronActionForDay(12, 'escalated').kind).toBe('reminder_escalation')
  })
})
