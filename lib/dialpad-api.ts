/**
 * Thin Dialpad REST client (api/v2). Auth is a Bearer API key. List endpoints
 * paginate with an opaque `cursor`; we follow it to exhaustion. Used by the
 * subscription-reconcile job (P0-5) — see lib/dialpad-reconcile.ts.
 */

const BASE = 'https://dialpad.com/api/v2'

/** call_states we subscribe to: metadata at hangup, AI recap on the later event. */
export const SUBSCRIBED_CALL_STATES = ['hangup', 'recap_summary'] as const

function apiKey(): string {
  const key = process.env.DIALPAD_API_KEY
  if (!key) throw new Error('DIALPAD_API_KEY is not set')
  return key
}

async function dialpadFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Dialpad ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 400)}`)
  }
  // DELETE returns empty bodies.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

type Paged<T> = { items?: T[]; cursor?: string | null }

/** Walk every page of a list endpoint, following `cursor`. */
async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null | undefined
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: Paged<T> = await dialpadFetch(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path)
    out.push(...(page.items ?? []))
    cursor = page.cursor
  } while (cursor)
  return out
}

export type DialpadDepartment = { id: string | number; name?: string; office_id?: string | number }

export async function listDepartments(): Promise<DialpadDepartment[]> {
  return listAll<DialpadDepartment>('/departments')
}

export type DialpadDepartmentUser = {
  id: string | number
  display_name?: string
  first_name?: string
  last_name?: string
}

/**
 * Members of a department. Unlike most list endpoints this returns `{ users }`
 * (not `{ items }`), so it gets its own pager.
 */
export async function listDepartmentUsers(departmentId: string): Promise<{ id: string; name: string | null }[]> {
  const path = `/departments/${encodeURIComponent(departmentId)}/operators`
  const users: DialpadDepartmentUser[] = []
  let cursor: string | null | undefined
  do {
    const page: { users?: DialpadDepartmentUser[]; cursor?: string | null } = await dialpadFetch(
      cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path,
    )
    users.push(...(page.users ?? []))
    cursor = page.cursor
  } while (cursor)

  return users.map(u => ({
    id: String(u.id),
    name: u.display_name ?? [u.first_name, u.last_name].filter(Boolean).join(' ') ?? null,
  }))
}

export type DialpadCallSubscription = {
  id: string | number
  webhook?: { id?: string | number } // Dialpad nests the webhook object (not webhook_id)
  target_type?: string
  target_id?: string | number
  enabled?: boolean
  call_states?: string[]
}

export async function listCallEventSubscriptions(): Promise<DialpadCallSubscription[]> {
  return listAll<DialpadCallSubscription>('/subscriptions/call')
}

export async function createCallEventSubscription(opts: {
  webhookId: string
  targetId: string
}): Promise<DialpadCallSubscription> {
  return dialpadFetch<DialpadCallSubscription>('/subscriptions/call', {
    method: 'POST',
    body: JSON.stringify({
      webhook_id: opts.webhookId,
      enabled: true,
      target_type: 'user',
      target_id: opts.targetId,
      call_states: SUBSCRIBED_CALL_STATES,
    }),
  })
}

export async function deleteCallEventSubscription(id: string): Promise<void> {
  await dialpadFetch(`/subscriptions/call/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type DialpadCallRecord = {
  call_id?: number | null
  direction?: string | null
  external_number?: string | null
  target?: { id?: string | number | null; name?: string | null }
  date_started?: number | null
  date_connected?: number | null
  date_ended?: number | null
  duration?: number | null
  total_duration?: number | null
}

/** Concluded calls for a target, newest first. Requires `calls:list` scope. */
export async function listCalls(opts: {
  targetId: string
  targetType?: 'user'
  startedAfter?: number
  startedBefore?: number
}): Promise<DialpadCallRecord[]> {
  const params = new URLSearchParams({
    target_type: opts.targetType ?? 'user',
    target_id: opts.targetId,
  })
  if (opts.startedAfter != null) params.set('started_after', String(opts.startedAfter))
  if (opts.startedBefore != null) params.set('started_before', String(opts.startedBefore))
  return listAll<DialpadCallRecord>(`/call?${params.toString()}`)
}

type AiRecapResponse = {
  summary?: { content?: string | null } | null
}

/** AI recap for one call. Requires `ai_recap` scope. Rate limit: 12/min. */
export async function getCallAiRecap(callId: string | number): Promise<string | null> {
  const path = `/call/${encodeURIComponent(String(callId))}/ai_recap?summary_format=medium`
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      accept: 'application/json',
    },
  })
  // Short calls / voicemails / non-AI calls never get a recap.
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Dialpad GET ${path} failed: ${res.status} ${body.slice(0, 400)}`)
  }
  const data = (await res.json()) as AiRecapResponse
  const content = data.summary?.content
  return content?.trim() ? content.trim() : null
}
