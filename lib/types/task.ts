export type TaskStatus = 'open' | 'done' | 'snoozed'
export type ProgramContext = 'vinfast' | 'tesla' | 'multidrive' | 'general'

export interface Task {
  id: string
  location_id: string
  title: string
  description: string | null
  due_date: string | null
  status: TaskStatus
  snoozed_until: string | null
  created_by_email: string
  program_context: ProgramContext | null
  source: string
  trigger_reason: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface TaskWithLocation extends Task {
  location: {
    id: string
    name: string
    chain_name: string | null
    city?: string | null
    state?: string | null
  } | null
}

export interface CreateTaskInput {
  location_id: string
  title: string
  description?: string
  due_date?: string | null
  program_context?: ProgramContext
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  due_date?: string | null
  status?: TaskStatus
  snoozed_until?: string | null
  program_context?: ProgramContext | null
}
