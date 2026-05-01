import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { CreateTaskInput, ProgramContext, TaskStatus } from '@/lib/types/task'

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

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as CreateTaskInput
  const locationId = body.location_id?.trim()
  const title = body.title?.trim()
  const description = body.description?.trim()

  if (!locationId || !title) {
    return NextResponse.json({ error: 'location_id and title are required' }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'Title must be 200 characters or fewer' }, { status: 400 })
  }
  if (body.due_date && !isDateOnly(body.due_date)) {
    return NextResponse.json({ error: 'due_date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (body.program_context && !isProgramContext(body.program_context)) {
    return NextResponse.json({ error: 'Invalid program_context' }, { status: 400 })
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      location_id: locationId,
      title,
      description: description || null,
      due_date: body.due_date || null,
      created_by_email: email,
      program_context: body.program_context ?? 'general',
      source: 'manual',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')?.trim() || null
  const status = searchParams.get('status')?.trim() || null
  const dueBefore = searchParams.get('due_before')?.trim() || null
  const programContext = searchParams.get('program_context')?.trim() || null

  if (status && !isTaskStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (programContext && !isProgramContext(programContext)) {
    return NextResponse.json({ error: 'Invalid program_context' }, { status: 400 })
  }
  if (dueBefore && !isDateOnly(dueBefore)) {
    return NextResponse.json({ error: 'due_before must be YYYY-MM-DD' }, { status: 400 })
  }

  let query = supabaseAdmin
    .from('tasks')
    .select(`
      *,
      location:locations(id, name, chain_name, city, state)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (locationId) {
    query = query.eq('location_id', locationId)
  } else {
    query = query.eq('created_by_email', email)
  }

  if (status) query = query.eq('status', status)
  if (dueBefore) query = query.lte('due_date', dueBefore)
  if (programContext) query = query.eq('program_context', programContext)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
