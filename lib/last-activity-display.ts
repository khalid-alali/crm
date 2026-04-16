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
): { label: string; dot: LastActivityDot; daysSince: number } {
  const createdMs = Date.parse(createdAtIso)
  const lastMs = lastActivityAtIso ? Date.parse(lastActivityAtIso) : NaN
  const hasMeaningfulActivity = Number.isFinite(lastMs)

  const displayMs = hasMeaningfulActivity ? lastMs : createdMs

  const todayStart = startOfLocalDay(nowMs)
  const displayDayStart = startOfLocalDay(displayMs)
  const daysSince = wholeLocalDaysBetween(displayDayStart, todayStart)

  const display = new Date(displayMs)
  const now = new Date(nowMs)
  const isToday =
    display.getFullYear() === now.getFullYear() &&
    display.getMonth() === now.getMonth() &&
    display.getDate() === now.getDate()

  const label = isToday
    ? 'Today'
    : display.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

  let dot: LastActivityDot
  if (daysSince <= 7) dot = 'green'
  else if (daysSince <= 14) dot = 'amber'
  else dot = 'red'

  return { label, dot, daysSince }
}
