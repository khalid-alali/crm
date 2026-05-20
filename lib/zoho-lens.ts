import { getZohoAccessToken } from '@/lib/zohosign'

function lensApiRoot(): string {
  const raw = process.env.ZOHO_LENS_API_BASE?.trim() || 'https://lens.zoho.com/api/v2'
  return raw.replace(/\/$/, '')
}

function lensWebHost(): string {
  const fromEnv = process.env.ZOHO_LENS_WEB_HOST?.trim()
  if (fromEnv) return fromEnv.replace(/^https?:\/\//, '').split('/')[0]!
  try {
    const u = new URL(lensApiRoot().replace(/\/api\/v2\/?$/, '') || 'https://lens.zoho.com')
    return u.host
  } catch {
    return 'lens.zoho.com'
  }
}

export function absolutizeLensUrl(pathOrUrl: string): string {
  const s = pathOrUrl.trim()
  if (/^https?:\/\//i.test(s)) return s
  const path = s.startsWith('/') ? s : `/${s}`
  return `https://${lensWebHost()}${path}`
}

function requireDepartmentId(): string {
  const id = process.env.ZOHO_LENS_DEPARTMENT_ID?.trim()
  if (!id) throw new Error('ZOHO_LENS_DEPARTMENT_ID is not configured')
  return id
}

type LensApiEnvelope = {
  representation?: Record<string, unknown>
  message?: string
  code?: string
}

async function lensFetch(path: string, init?: RequestInit): Promise<LensApiEnvelope> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${lensApiRoot()}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const data = (await res.json().catch(() => ({}))) as LensApiEnvelope & { error?: string }
  if (!res.ok) {
    const detail = data.message ?? data.error ?? JSON.stringify(data)
    throw new Error(`Zoho Lens API ${res.status}: ${detail}`)
  }
  return data
}

export async function createLensInstantSession(): Promise<{ technicianUrl: string }> {
  const departmentId = requireDepartmentId()
  const data = await lensFetch(`/lens_session?department_id=${encodeURIComponent(departmentId)}`, {
    method: 'POST',
  })
  const rep = data.representation ?? {}
  const techPath = typeof rep.technician_url === 'string' ? rep.technician_url : null
  if (!techPath) throw new Error('Zoho Lens did not return technician_url')
  return { technicianUrl: absolutizeLensUrl(techPath) }
}

export type ScheduleLensSessionParams = {
  title: string
  notes?: string
  customerEmail: string
  scheduleStartMs: number
  scheduleEndMs: number
  utcOffset: string
  timeZone: string
  reminderMinutes: number
}

export async function scheduleLensSession(
  params: ScheduleLensSessionParams
): Promise<{ scheduleId: string; technicianUrl: string; customerUrl: string }> {
  const departmentId = requireDepartmentId()
  const assignee = process.env.ZOHO_LENS_ASSIGNEE_ZUID?.trim()

  const body: Record<string, unknown> = {
    mode: 'SCHEDULE',
    title: params.title,
    notes: params.notes ?? '',
    customer_email: params.customerEmail,
    schedule_time: params.scheduleStartMs,
    schedule_upto: params.scheduleEndMs,
    utc_offset: params.utcOffset,
    time_zone: params.timeZone,
    reminder: params.reminderMinutes,
    department_id: Number(departmentId),
  }
  if (assignee) body.assignee_zuid = assignee

  const data = await lensFetch('/lens_session/schedule', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const rep = data.representation ?? {}
  const scheduleId = typeof rep.schedule_id === 'string' ? rep.schedule_id : String(rep.schedule_id ?? '')
  const tech = typeof rep.technician_url === 'string' ? rep.technician_url : null
  const customer = typeof rep.customer_url === 'string' ? rep.customer_url : null
  if (!scheduleId || !tech || !customer) {
    throw new Error('Zoho Lens schedule response missing schedule_id or join URLs')
  }
  return {
    scheduleId,
    technicianUrl: absolutizeLensUrl(tech),
    customerUrl: absolutizeLensUrl(customer),
  }
}
