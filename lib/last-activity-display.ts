export type LastActivityDot = 'green' | 'amber' | 'red'

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Calendar-day difference from `fromDayStart` to `toDayStart` (non-negative). */
function wholeLocalDaysBetween(fromDayStart: number, toDayStart: number): number {
  return Math.max(0, Math.floor((toDayStart - fromDayStart) / 86_400_000))
}

/**
 * Pipeline "Last activity" label + freshness dot. Uses the environment timezone
 * (pass `Date.now()` from the browser after mount for correct local "today").
 */
export function computeLastActivityDisplay(
  createdAtIso: string,
  lastActivityAtIso: string | null,
  nowMs: number = Date.now(),
): { label: string; fullTimestamp: string; dot: LastActivityDot; daysSince: number } {
  const createdMs = Date.parse(createdAtIso)
  const lastMs = lastActivityAtIso ? Date.parse(lastActivityAtIso) : NaN
  const hasMeaningfulActivity = Number.isFinite(lastMs)

  const displayMs = hasMeaningfulActivity ? lastMs : createdMs

  const todayStart = startOfLocalDay(nowMs)
  const displayDayStart = startOfLocalDay(displayMs)
  const daysSince = wholeLocalDaysBetween(displayDayStart, todayStart)

  const display = new Date(displayMs)
  const now = new Date(nowMs)
  const msSince = Math.max(0, nowMs - displayMs)

  let label: string
  if (msSince < 86_400_000) {
    label = 'Today'
  } else if (daysSince < 7) {
    label = daysSince === 1 ? '1 day ago' : `${daysSince} days ago`
  } else if (daysSince < 90) {
    label = display.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } else {
    label = display.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const fullTimestamp = display.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  let dot: LastActivityDot
  if (daysSince <= 7) dot = 'green'
  else if (daysSince <= 14) dot = 'amber'
  else dot = 'red'

  return { label, fullTimestamp, dot, daysSince }
}
