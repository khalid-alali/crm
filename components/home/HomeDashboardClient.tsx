'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import TaskRow from '@/components/tasks/TaskRow'
import { groupOpenTasksByQueue } from '@/lib/tasks/date-groups'
import type { Task, TaskWithLocation } from '@/lib/types/task'

type ContractCard = {
  id: string
  locationId: string | null
  shopName: string
  subtitle: string
}

interface HomeDashboardClientProps {
  currentUserEmail: string
  awaitingSignature: ContractCard[]
  recentlySigned: ContractCard[]
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export default function HomeDashboardClient({
  currentUserEmail,
  awaitingSignature,
  recentlySigned,
}: HomeDashboardClientProps) {
  const [tasks, setTasks] = useState<TaskWithLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithLocation | undefined>(undefined)
  const [showNoDueDate, setShowNoDueDate] = useState(false)

  async function loadTasks() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks?status=open', { cache: 'no-store' })
      const data = (await res.json().catch(() => [])) as Array<TaskWithLocation> & { error?: string }
      if (!res.ok) {
        setTasks([])
        setError((data as { error?: string }).error ?? 'Could not load tasks')
        return
      }
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      setTasks([])
      setError('Could not load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [])

  const grouped = useMemo(() => groupOpenTasksByQueue(tasks), [tasks])
  const allQueueCount = grouped.overdue.length + grouped.today.length + grouped.thisWeek.length + grouped.noDueDate.length

  function upsertTask(updated: Task, sourceTask: TaskWithLocation) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? { ...sourceTask, ...updated } : t)))
  }

  function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  function section(
    title: string,
    tasksForSection: TaskWithLocation[],
    tone: 'danger' | 'warn' | 'default' = 'default',
  ) {
    if (tasksForSection.length === 0) return null
    const toneClasses =
      tone === 'danger'
        ? 'border-red-200 bg-red-50'
        : tone === 'warn'
          ? 'border-amber-200 bg-amber-50'
          : 'border-arctic-200 bg-white'
    return (
      <section className={`overflow-hidden rounded-xl border ${toneClasses}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-onix-900">{title}</h2>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-onix-700">
            {tasksForSection.length}
          </span>
        </div>
        <div className="border-t border-arctic-200 bg-white">
          {tasksForSection.map(task => (
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
      </section>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-onix-950">Home</h1>
          <p className="mt-1 text-sm text-onix-500">Your follow-ups for today, {todayLabel()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingTask(undefined)
              setShowTaskModal(true)
            }}
            className="rounded-xl border border-arctic-300 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
          >
            + New task
          </button>
          <Link
            href="/shops"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View pipeline
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-arctic-200 bg-white px-4 py-6 text-sm text-onix-500">
          Loading tasks...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
          {error}
        </div>
      ) : allQueueCount === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            <p className="font-medium">All caught up — nothing in the queue.</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingTask(undefined)
                setShowTaskModal(true)
              }}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100"
            >
              + New task
            </button>
            <Link
              href="/shops"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100"
            >
              View pipeline
            </Link>
            <Link
              href="/tasks"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100"
            >
              View all tasks →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {section('Overdue', grouped.overdue, 'danger')}
          {section('Today', grouped.today, 'warn')}
          {section('This week', grouped.thisWeek)}
          {grouped.noDueDate.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-arctic-200 bg-white">
              <button
                type="button"
                onClick={() => setShowNoDueDate(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <h2 className="text-sm font-semibold text-onix-900">No due date</h2>
                <span className="rounded-full bg-arctic-100 px-2 py-0.5 text-xs font-semibold text-onix-700">
                  {grouped.noDueDate.length}
                </span>
              </button>
              {showNoDueDate && (
                <div className="border-t border-arctic-200">
                  {grouped.noDueDate.map(task => (
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
              )}
            </section>
          )}
          <div className="flex justify-end pt-1">
            <Link
              href="/tasks"
              className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              View all tasks →
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-3 pt-2">
        <h2 className="text-xl font-semibold text-onix-950">Contract status</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-arctic-200 bg-white">
            <div className="flex items-center justify-between border-b border-arctic-200 px-4 py-3">
              <p className="text-sm font-semibold text-onix-900">Awaiting signature</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {awaitingSignature.length}
              </span>
            </div>
            <div className="divide-y divide-arctic-100">
              {awaitingSignature.length === 0 ? (
                <p className="px-4 py-3 text-sm text-onix-500">No contracts waiting for signature.</p>
              ) : (
                awaitingSignature.map(item => (
                  <Link
                    key={item.id}
                    href={item.locationId ? `/shops/${item.locationId}` : '#'}
                    className="block px-4 py-3 hover:bg-arctic-50"
                  >
                    <p className="text-sm font-medium text-onix-900">{item.shopName}</p>
                    <p className="text-xs text-onix-500">{item.subtitle}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-arctic-200 bg-white">
            <div className="flex items-center justify-between border-b border-arctic-200 px-4 py-3">
              <p className="text-sm font-semibold text-onix-900">Recently signed</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {recentlySigned.length}
              </span>
            </div>
            <div className="divide-y divide-arctic-100">
              {recentlySigned.length === 0 ? (
                <p className="px-4 py-3 text-sm text-onix-500">No recently signed contracts yet.</p>
              ) : (
                recentlySigned.map(item => (
                  <Link
                    key={item.id}
                    href={item.locationId ? `/shops/${item.locationId}` : '#'}
                    className="block px-4 py-3 hover:bg-arctic-50"
                  >
                    <p className="text-sm font-medium text-onix-900">{item.shopName}</p>
                    <p className="text-xs text-onix-500">{item.subtitle}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {showTaskModal && (
        <TaskFormModal
          open={showTaskModal}
          onClose={() => {
            setShowTaskModal(false)
            setEditingTask(undefined)
          }}
          onSuccess={task => {
            if (editingTask) {
              setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...task } : t)))
            } else {
              void loadTasks()
            }
          }}
          taskToEdit={editingTask}
        />
      )}
    </div>
  )
}
