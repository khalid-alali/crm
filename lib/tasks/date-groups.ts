import type { Task, TaskWithLocation } from '@/lib/types/task'

export type OpenQueueGroups<TTask extends Task | TaskWithLocation> = {
  overdue: TTask[]
  today: TTask[]
  thisWeek: TTask[]
  noDueDate: TTask[]
}

function parseDateOnlyToLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function dateOnlyTodayLocal(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function endOfWeekSundayLocal(now: Date = new Date()): Date {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = end.getDay()
  end.setDate(end.getDate() + (7 - day))
  end.setHours(0, 0, 0, 0)
  return end
}

export function groupOpenTasksByQueue<TTask extends Task | TaskWithLocation>(
  tasks: TTask[],
  now: Date = new Date(),
): OpenQueueGroups<TTask> {
  const today = dateOnlyTodayLocal(now)
  const endOfWeek = endOfWeekSundayLocal(now)
  const grouped: OpenQueueGroups<TTask> = {
    overdue: [],
    today: [],
    thisWeek: [],
    noDueDate: [],
  }

  for (const task of tasks) {
    if (!task.due_date) {
      grouped.noDueDate.push(task)
      continue
    }

    if (task.due_date < today) {
      grouped.overdue.push(task)
      continue
    }

    if (task.due_date === today) {
      grouped.today.push(task)
      continue
    }

    const due = parseDateOnlyToLocal(task.due_date)
    if (due <= endOfWeek) {
      grouped.thisWeek.push(task)
    }
  }

  return grouped
}

export function isTaskResolvedInLast30Days(task: Task | TaskWithLocation, now: Date = new Date()): boolean {
  if (!task.resolved_at) return false
  const resolvedAt = new Date(task.resolved_at)
  if (Number.isNaN(resolvedAt.getTime())) return false
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 30)
  return resolvedAt >= cutoff
}

export function taskDueDateLabel(task: Task | TaskWithLocation, now: Date = new Date()): {
  tone: 'overdue' | 'today' | 'upcoming' | 'none'
  label: string
} {
  if (!task.due_date) return { tone: 'none', label: 'No due date' }
  const today = dateOnlyTodayLocal(now)
  if (task.due_date < today) return { tone: 'overdue', label: `${task.due_date}` }
  if (task.due_date === today) return { tone: 'today', label: 'Today' }
  return { tone: 'upcoming', label: task.due_date }
}
