import type { TaskWithLocation } from '@/lib/types/task'
import { dateOnlyTodayLocal, endOfWeekSundayLocal } from '@/lib/tasks/date-groups'

export function dateOnlyFromLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function endOfCurrentWeekSundayDateOnly(now: Date = new Date()): string {
  return dateOnlyFromLocalDate(endOfWeekSundayLocal(now))
}

/** Next calendar week: Monday after this week's Sunday through the following Sunday. */
export function nextWeekRangeDateOnly(now: Date = new Date()): { start: string; end: string } {
  const weekEnd = endOfWeekSundayLocal(now)
  const monday = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() + 1)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  return { start: dateOnlyFromLocalDate(monday), end: dateOnlyFromLocalDate(sunday) }
}

export function lastDayOfCurrentMonthDateOnly(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth()
  const last = new Date(y, m + 1, 0)
  return dateOnlyFromLocalDate(last)
}

export type TaskWindowFilter = 'all' | 'overdue' | 'this_week' | 'next_week' | 'this_month' | 'no_due_date'

export function taskMatchesDueWindow(
  dueDate: string | null,
  window: TaskWindowFilter,
  now: Date = new Date(),
): boolean {
  const today = dateOnlyTodayLocal(now)
  switch (window) {
    case 'all':
      return true
    case 'no_due_date':
      return dueDate == null
    case 'overdue':
      return dueDate != null && dueDate < today
    case 'this_week': {
      if (!dueDate) return false
      const endSun = endOfCurrentWeekSundayDateOnly(now)
      return dueDate >= today && dueDate <= endSun
    }
    case 'next_week': {
      if (!dueDate) return false
      const { start, end } = nextWeekRangeDateOnly(now)
      return dueDate >= start && dueDate <= end
    }
    case 'this_month': {
      if (!dueDate) return false
      const last = lastDayOfCurrentMonthDateOnly(now)
      return dueDate >= today && dueDate <= last
    }
    default:
      return true
  }
}

/** due_date asc, nulls last; then created_at asc */
export function sortTasksForAllView<T extends { due_date: string | null; created_at: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.due_date == null && b.due_date == null) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }
    if (a.due_date == null) return 1
    if (b.due_date == null) return -1
    const cmp = a.due_date.localeCompare(b.due_date)
    if (cmp !== 0) return cmp
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export function filterTasksForAllView(
  tasks: TaskWithLocation[],
  opts: {
    status: 'open' | 'done' | 'all'
    window: TaskWindowFilter
    program: 'all' | 'vinfast' | 'tesla' | 'multidrive' | 'general'
  },
  now: Date = new Date(),
): TaskWithLocation[] {
  let out = tasks

  if (opts.status === 'open') {
    out = out.filter(t => t.status === 'open')
  } else if (opts.status === 'done') {
    out = out.filter(t => t.status === 'done')
  }

  if (opts.program !== 'all') {
    out = out.filter(t => (t.program_context ?? 'general') === opts.program)
  }

  if (opts.window !== 'all') {
    out = out.filter(t => taskMatchesDueWindow(t.due_date, opts.window, now))
  }

  return sortTasksForAllView(out)
}
