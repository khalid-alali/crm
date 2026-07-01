export type RoutableCompanyStatus = 'added' | 'invited' | 'accepted' | string

export type RoutableCredentials = {
  apiKey: string
  teamMemberId: string
}

export type RoutableCompany = {
  id: string
  status: RoutableCompanyStatus | null
  paymentMethodCount: number
  accountLast4: string | null
}

export type RoutableEmbeddedInvite = {
  externalFlowUrl: string
  companyStatus: RoutableCompanyStatus | null
}

const ROUTABLE_API_BASE = 'https://api.routable.com/v1'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function routableCredentialsFromEnv(): RoutableCredentials | null {
  const apiKey = cleanText(process.env.ROUTABLE_API_KEY)
  const teamMemberId = cleanText(process.env.ROUTABLE_TEAM_MEMBER_ID)
  if (!apiKey || !teamMemberId) return null
  return { apiKey, teamMemberId }
}

function paymentMethodsFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  }
  if (payload && typeof payload === 'object') {
    const results = (payload as { results?: unknown }).results
    if (Array.isArray(results)) {
      return results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    }
  }
  return []
}

export function parsePaymentMethodCount(payload: unknown): number {
  return paymentMethodsFromPayload(payload).length
}

export function parseAccountLast4(payload: unknown): string | null {
  const methods = paymentMethodsFromPayload(payload)
  if (methods.length === 0) return null
  const first = methods[0]
  const candidates = [first.last4, first.account_last4, first.bank_account_last4]
  for (const value of candidates) {
    const raw = cleanText(value)
    if (!raw) continue
    const normalized = raw.replace(/\D/g, '').slice(-4)
    if (normalized.length === 4) return normalized
  }
  return null
}

function parseCompanyStatus(payload: unknown): RoutableCompanyStatus | null {
  if (!payload || typeof payload !== 'object') return null
  const status = cleanText((payload as { status?: unknown }).status)
  return status || null
}

function urlFromLinks(links: unknown): string | null {
  if (!links || typeof links !== 'object') return null
  const obj = links as Record<string, unknown>
  for (const key of ['external_flow_url', 'invitation_url'] as const) {
    const url = cleanText(obj[key])
    if (url) return url
  }
  return null
}

function contactResultsFromPayload(root: Record<string, unknown>): unknown[] {
  const contacts = root.contacts
  if (Array.isArray(contacts)) return contacts
  if (contacts && typeof contacts === 'object') {
    const results = (contacts as { results?: unknown }).results
    if (Array.isArray(results)) return results
  }
  return []
}

export function parseExternalFlowUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  const direct = cleanText(root.external_flow_url)
  if (direct) return direct

  const fromRootLinks = urlFromLinks(root.links)
  if (fromRootLinks) return fromRootLinks

  for (const contact of contactResultsFromPayload(root)) {
    if (!contact || typeof contact !== 'object') continue
    const contactObj = contact as Record<string, unknown>
    const contactUrl = cleanText(contactObj.external_flow_url)
    if (contactUrl) return contactUrl
    const fromContactLinks = urlFromLinks(contactObj.links)
    if (fromContactLinks) return fromContactLinks
  }

  const results = root.results
  if (Array.isArray(results)) {
    for (const item of results) {
      const url = parseExternalFlowUrl(item)
      if (url) return url
    }
  }

  return null
}

async function routableFetch(
  creds: RoutableCredentials,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${creds.apiKey}`)
  headers.set('accept', 'application/json')
  if (init?.body) headers.set('Content-Type', 'application/json')
  if (!headers.has('X-Team-Member-Id')) headers.set('X-Team-Member-Id', creds.teamMemberId)
  return fetch(`${ROUTABLE_API_BASE}${path}`, { ...init, headers })
}

export async function retrieveRoutableCompany(
  creds: RoutableCredentials,
  companyId: string,
): Promise<RoutableCompany> {
  const res = await routableFetch(creds, `/companies/${encodeURIComponent(companyId)}`)
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(raw ? `Routable retrieve company failed (${res.status}): ${raw.slice(0, 300)}` : `Routable retrieve company failed (${res.status})`)
  }
  const payload = (await res.json()) as unknown
  const [paymentMethodsRes] = await Promise.all([
    routableFetch(creds, `/companies/${encodeURIComponent(companyId)}/payment-methods`),
  ])
  let paymentMethodCount = 0
  let accountLast4: string | null = null
  if (paymentMethodsRes.ok) {
    const pmPayload = (await paymentMethodsRes.json()) as unknown
    paymentMethodCount = parsePaymentMethodCount(pmPayload)
    accountLast4 = parseAccountLast4(pmPayload)
  }

  return {
    id: companyId,
    status: parseCompanyStatus(payload),
    paymentMethodCount,
    accountLast4,
  }
}

export async function createRoutableEmbeddedInvite(
  creds: RoutableCredentials,
  companyId: string,
  confirmationRedirectUrl: string,
): Promise<RoutableEmbeddedInvite> {
  const res = await routableFetch(creds, `/companies/${encodeURIComponent(companyId)}/invite`, {
    method: 'POST',
    body: JSON.stringify({
      get_links: true,
      send_invite_email: false,
      acting_team_member: creds.teamMemberId,
      confirmation_redirect_url: confirmationRedirectUrl,
      message: 'Connect your bank account to unlock your Fixlane onboarding portal.',
    }),
  })

  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(raw ? `Routable invite failed (${res.status}): ${raw.slice(0, 300)}` : `Routable invite failed (${res.status})`)
  }

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('Routable invite returned invalid JSON')
  }

  const externalFlowUrl = parseExternalFlowUrl(payload)
  if (!externalFlowUrl) {
    throw new Error('Routable invite did not return an external_flow_url — check that the company has an actionable contact.')
  }

  return {
    externalFlowUrl,
    companyStatus: parseCompanyStatus(payload) ?? 'invited',
  }
}
