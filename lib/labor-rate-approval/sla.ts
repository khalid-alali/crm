export const LA_TIMEZONE = 'America/Los_Angeles'
const SLA_CALENDAR_DAYS = 7

/** YYYY-MM-DD in America/Los_Angeles. */
export function laDateKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-CA', { timeZone: LA_TIMEZONE })
}

/** Whole calendar days elapsed since `submittedAt` (LA), day 0 = submit day. */
export function calendarDaysSince(submittedAt: string, now: Date = new Date()): number {
  const startKey = laDateKey(submittedAt)
  const endKey = laDateKey(now)
  const start = new Date(`${startKey}T12:00:00Z`).getTime()
  const end = new Date(`${endKey}T12:00:00Z`).getTime()
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

/** Days remaining until SLA due (floor at 0). */
export function daysLeft(submittedAt: string, now: Date = new Date()): number {
  const day = calendarDaysSince(submittedAt, now)
  return Math.max(0, SLA_CALENDAR_DAYS - day)
}

/** End of the 7th LA calendar day after submit (23:59:59.999 LA). */
export function slaDueAt(submittedAt: Date): Date {
  const key = laDateKey(submittedAt)
  const [y, m, d] = key.split('-').map(Number)
  const dueKey = addCalendarDays(y, m, d, SLA_CALENDAR_DAYS)
  const dueParts = dueKey.split('-').map(Number)
  const dueY = dueParts[0]!
  const dueM = dueParts[1]!
  const dueD = dueParts[2]!
  const probe = new Date(Date.UTC(dueY, dueM - 1, dueD, 12, 0, 0))
  const laHour = Number(
    probe.toLocaleString('en-US', { timeZone: LA_TIMEZONE, hour: 'numeric', hour12: false }),
  )
  const offsetHours = 12 - laHour
  return new Date(Date.UTC(dueY, dueM - 1, dueD, 23 - offsetHours, 59, 59, 999))
}

function addCalendarDays(y: number, m: number, d: number, days: number): string {
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Card label date: `Mon D` in LA time. */
export function formatMonD(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-US', {
    timeZone: LA_TIMEZONE,
    month: 'short',
    day: 'numeric',
  })
}

export function formatRateDollars(rate: number): string {
  return `$${Number(rate).toFixed(2)}`
}
