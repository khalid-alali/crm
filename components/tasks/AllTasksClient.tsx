'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import TaskRow from '@/components/tasks/TaskRow'
import type { ProgramContext, Task, TaskWithLocation } from '@/lib/types/task'
import type { TaskWindowFilter } from '@/lib/tasks/window-filters'
import { filterTasksForAllView } from '@/lib/tasks/window-filters'

type StatusFilter = 'open' | 'done' | 'all'
type ProgramFilter = 'all' | ProgramContext

const DEFAULT_STATUS: StatusFilter = 'open'
const DEFAULT_WINDOW: TaskWindowFilter = 'all'
const DEFAULT_PROGRAM: ProgramFilter = 'all'

interface AllTasksClientProps {
  currentUserEmail: string
}

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
]

const WINDOW_OPTIONS: Array<{ key: TaskWindowFilter; label: string }> = [
  { key: 'all', label: 'All time' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'this_week', label: 'This week' },
  { key: 'next_week', label: 'Next week' },
  { key: 'this_month', label: 'This month' },
  { key: 'no_due_date', label: 'No due date' },
]

const PROGRAM_OPTIONS: Array<{ key: ProgramFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'vinfast', label: 'VinFast' },
  { key: 'tesla', label: 'Tesla' },
  { key: 'multidrive', label: 'Multidrive' },
  { key: 'general', label: 'General' },
]

function pillClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'border-brand-500 bg-brand-50 text-brand-900'
      : 'border-arctic-300 bg-white text-onix-800 hover:bg-arctic-50'
  }`
}

export default function AllTasksClient({ currentUserEmail }: AllTasksClientProps) {
  const [allTasks, setAllTasks] = useState<TaskWithLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS)
  const [windowFilter, setWindowFilter] = useState<TaskWindowFilter>(DEFAULT_WINDOW)
  const [programFilter, setProgramFilter] = useState<ProgramFilter>(DEFAULT_PROGRAM)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithLocation | undefined>(undefined)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' })
      const data = (await res.json().catch(() => [])) as TaskWithLocation[] & { error?: string }
      if (!res.ok) {
        setAllTasks([])
        setFetchError((data as { error?: string }).error ?? 'Could not load tasks')
        return
      }
      setAllTasks(Array.isArray(data) ? data : [])
    } catch {
      setAllTasks([])
      setFetchError('Could not load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const filteredTasks = useMemo(
    () =>
      filterTasksForAllView(allTasks, {
        status: statusFilter,
        window: windowFilter,
        program: programFilter,
      }),
    [allTasks, statusFilter, windowFilter, programFilter],
  )

  function clearFilters() {
    setStatusFilter(DEFAULT_STATUS)
    setWindowFilter(DEFAULT_WINDOW)
    setProgramFilter(DEFAULT_PROGRAM)
  }

  function upsertTask(updated: Task, sourceTask: TaskWithLocation) {
    setAllTasks(prev =>
      prev.map(t => (t.id === updated.id ? { ...sourceTask, ...updated, location: t.location } : t)),
    )
  }

  function removeTask(taskId: string) {
    setAllTasks(prev => prev.filter(t => t.id !== taskId))
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-onix-950">Tasks</h1>
          <p className="mt-1 text-sm text-onix-500">All your follow-ups</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingTask(undefined)
            setShowTaskModal(true)
          }}
          className="shrink-0 rounded-xl border border-arctic-300 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
        >
          + New task
        </button>
      </div>

      <div className="rounded-2xl border border-arctic-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Status</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={pillClass(statusFilter === opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Window</div>
            <div className="flex flex-wrap gap-2">
              {WINDOW_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setWindowFilter(opt.key)}
                  className={pillClass(windowFilter === opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-onix-500">Program</div>
            <div className="flex flex-wrap gap-2">
              {PROGRAM_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setProgramFilter(opt.key)}
                  className={pillClass(programFilter === opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {fetchError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">{fetchError}</div>
      ) : loading ? (
        <div className="rounded-xl border border-arctic-200 bg-white px-4 py-8 text-sm text-onix-500">Loading tasks…</div>
      ) : allTasks.length === 0 ? (
        <div className="rounded-xl border border-arctic-200 bg-white px-4 py-10 text-center">
          <p className="text-onix-700">You haven&apos;t created any tasks yet.</p>
          <button
            type="button"
            onClick={() => {
              setEditingTask(undefined)
              setShowTaskModal(true)
            }}
            className="mt-4 rounded-xl border border-arctic-300 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
          >
            + New task
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-arctic-200 bg-white px-4 py-10 text-center">
          <p className="text-onix-700">No tasks match these filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-onix-500">
              {filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'}
            </span>
            <span className="text-brand-700">Sort: due date ↑</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-arctic-200 bg-white">
            {filteredTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                showLocation
                currentUserEmail={currentUserEmail}
                onUpdate={updated => upsertTask(updated, task)}
                onDelete={removeTask}
                onEdit={t => {
                  setEditingTask(t)
                  setShowTaskModal(true)
                }}
              />
            ))}
          </div>
        </>
      )}

      {showTaskModal && (
        <TaskFormModal
          open={showTaskModal}
          onClose={() => {
            setShowTaskModal(false)
            setEditingTask(undefined)
          }}
          onSuccess={() => {
            void loadTasks()
            setEditingTask(undefined)
          }}
          taskToEdit={editingTask}
        />
      )}
    </div>
  )
}
