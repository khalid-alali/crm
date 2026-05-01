'use client'

import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Task, TaskWithLocation } from '@/lib/types/task'

interface TaskRowProps {
  task: TaskWithLocation
  showLocation?: boolean
  currentUserEmail: string
  onUpdate: (task: Task) => void
  onDelete: (id: string) => void
  onEdit?: (task: TaskWithLocation) => void
}

function formatDueDate(task: TaskWithLocation): { text: string; className: string } {
  if (!task.due_date) {
    return { text: 'No due date', className: 'text-onix-500' }
  }
  const today = new Date()
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  if (task.due_date < localToday) {
    const dt = new Date(`${task.due_date}T00:00:00`)
    const daysLate = Math.max(1, Math.floor((today.getTime() - dt.getTime()) / 86400000))
    return {
      text: `${daysLate} day${daysLate === 1 ? '' : 's'} late`,
      className: 'rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700',
    }
  }
  if (task.due_date === localToday) {
    return {
      text: 'Today',
      className: 'rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700',
    }
  }
  const future = new Date(`${task.due_date}T00:00:00`)
  return {
    text: future.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    className: 'text-sm text-onix-600',
  }
}

function programLabel(value: string | null): string {
  if (!value || value === 'general') return 'General'
  if (value === 'vinfast') return 'VinFast'
  if (value === 'multidrive') return 'Multidrive'
  if (value === 'tesla') return 'Tesla'
  return value
}

export default function TaskRow({
  task,
  showLocation = false,
  currentUserEmail,
  onUpdate,
  onDelete,
  onEdit,
}: TaskRowProps) {
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [localStatus, setLocalStatus] = useState(task.status)
  const due = useMemo(() => formatDueDate(task), [task])
  const isDone = localStatus === 'done'
  const canMutate = task.created_by_email === currentUserEmail

  async function toggleDone() {
    const next = isDone ? 'open' : 'done'
    setLocalStatus(next)
    setUpdating(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = (await res.json().catch(() => ({}))) as Task & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update task')
      }
      onUpdate(data)
    } catch {
      setLocalStatus(task.status)
    } finally {
      setUpdating(false)
    }
  }

  async function removeTask() {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDelete(task.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="group flex items-start justify-between gap-4 border-b border-arctic-200 px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => {
            if (!updating) void toggleDone()
          }}
          className="mt-1 h-4 w-4 rounded border-arctic-300"
          aria-label="Toggle task status"
        />
        <div className="min-w-0">
          <p className={`truncate text-lg font-medium ${isDone ? 'text-onix-500 line-through' : 'text-onix-950'}`}>
            {task.title}
          </p>
          <p className="text-sm text-onix-600">
            {showLocation
              ? `${task.location?.name ?? 'Unknown shop'} · ${programLabel(task.program_context)}`
              : `${programLabel(task.program_context)}`}
          </p>
          {task.description && (
            <div className="mt-2 rounded-md bg-arctic-100 px-3 py-2 text-sm text-onix-700">
              {task.description}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className={due.className}>{due.text}</span>
        {canMutate && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onEdit?.(task)}
              className="rounded p-1 text-onix-500 hover:bg-arctic-100 hover:text-onix-900"
              aria-label="Edit task"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleting) void removeTask()
              }}
              className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
