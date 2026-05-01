import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { ProgramContext, TaskStatus, UpdateTaskInput } from '@/lib/types/task'

const PROGRAM_CONTEXTS: ProgramContext[] = ['vinfast', 'tesla', 'multidrive', 'general']
const TASK_STATUSES: TaskStatus[] = ['open', 'done', 'snoozed']

function isProgramContext(value: string): value is ProgramContext {
  return PROGRAM_CONTEXTS.includes(value as ProgramContext)
}

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function loadTaskAndCheckAccess(taskId: string, userEmail: string) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (error || !task) return { error: 'Task not found', status: 404 as const }
  if (task.created_by_email !== userEmail) return { error: 'Forbidden', status: 403 as const }
  return { task }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getAppSession()
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await loadTaskAndCheckAccess(id, email)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = (await req.json()) as UpdateTaskInput
  const updatePayload: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = body.title.trim()
    if (!title || title.length > 200) {
      return NextResponse.json({ error: 'Title must be 1-200 characters' }, { status: 400 })
    }
    updatePayload.title = title
  }

  if (body.description !== undefined) {
    updatePayload.description = body.description?.trim() || null
  }

  if (body.due_date !== undefined) {
    if (body.due_date !== null && !isDateOnly(body.due_date)) {
      return NextResponse.json({ error: 'due_date must be YYYY-MM-DD' }, { status: 400 })
    }
    updatePayload.due_date = body.due_date
  }

  if (body.program_context !== undefined) {
    if (body.program_context !== null && !isProgramContext(body.program_context)) {
      return NextResponse.json({ error: 'Invalid program_context' }, { status: 400 })
    }
    updatePayload.program_context = body.program_context
  }

  if (body.status !== undefined) {
    if (!isTaskStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updatePayload.status = body.status
    if (body.status !== 'snoozed') {
      updatePayload.snoozed_until = null
    }
  }

  if (body.snoozed_until !== undefined) {
    if (body.snoozed_until !== null && !isDateOnly(body.snoozed_until)) {
      return NextResponse.json({ error: 'snoozed_until must be YYYY-MM-DD' }, { status: 400 })
    }
    updatePayload.snoozed_until = body.snoozed_until
  }

  if (body.status === 'snoozed' && !updatePayload.snoozed_until) {
    return NextResponse.json({ error: 'snoozed_until required when status is snoozed' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getAppSession()
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await loadTaskAndCheckAccess(id, email)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
