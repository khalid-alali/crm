const signApiBase = () => {
  const host = (process.env.ZOHO_SIGN_DOMAIN ?? 'sign.zoho.com').replace(/^https?:\/\//, '').split('/')[0]
  return `https://${host}/api/v1`
}

const accountsHost = () =>
  (process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'accounts.zoho.com').replace(/^https?:\/\//, '').split('/')[0]

let cachedAccessToken: string | null = null
let cachedAccessTokenExpiresAt = 0
let inflightAccessTokenPromise: Promise<string> | null = null

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function tokenStillValid() {
  return Boolean(cachedAccessToken) && Date.now() < cachedAccessTokenExpiresAt
}

export async function getZohoAccessToken(): Promise<string> {
  if (tokenStillValid()) {
    return cachedAccessToken as string
  }

  if (inflightAccessTokenPromise) {
    return inflightAccessTokenPromise
  }

  inflightAccessTokenPromise = (async () => {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await fetch(`https://${accountsHost()}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.ZOHO_CLIENT_ID!,
          client_secret: process.env.ZOHO_CLIENT_SECRET!,
          refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
        }),
      })
      const data = (await res.json()) as {
        access_token?: string
        expires_in?: number
        error?: string
        error_description?: string
      }
      if (data.access_token) {
        const expiresInSec = Number.isFinite(data.expires_in as number)
          ? Number(data.expires_in)
          : 3600
        cachedAccessToken = data.access_token
        cachedAccessTokenExpiresAt = Date.now() + Math.max(30, expiresInSec - 60) * 1000
        return data.access_token
      }

      lastError = new Error(`Zoho token exchange failed: ${JSON.stringify(data)}`)
      const msg = `${data.error ?? ''} ${data.error_description ?? ''}`.toLowerCase()
      const retryable = res.status === 429 || msg.includes('too many requests') || msg.includes('access denied')
      if (!retryable || attempt === 5) break

      await sleep(1000 * Math.pow(2, attempt - 1))
    }

    throw lastError instanceof Error ? lastError : new Error('Zoho token exchange failed')
  })()

  try {
    return await inflightAccessTokenPromise
  } finally {
    inflightAccessTokenPromise = null
  }
}

function looksLikePdf(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('application/pdf')
}

export type ZohoSignTemplateAction = {
  action_id?: string
  action_type?: string
  recipient_name?: string
  recipient_email?: string
  signing_order?: number
  role?: string
  verify_recipient?: boolean
}

async function getTemplateActions(
  accessToken: string,
  templateId: string
): Promise<{ actions: ZohoSignTemplateAction[]; requestNameDefault?: string }> {
  const res = await fetch(`${signApiBase()}/templates/${encodeURIComponent(templateId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Zoho Sign get template failed: ${res.status} ${text}`)

  const data = JSON.parse(text) as {
    templates?: {
      actions?: ZohoSignTemplateAction[]
      template_name?: string
    }
  }
  const actions = (data.templates?.actions ?? []) as ZohoSignTemplateAction[]
  if (!actions.length) throw new Error('Zoho Sign template has no actions')
  return {
    actions,
    requestNameDefault: data.templates?.template_name,
  }
}

/** Which SIGN actions receive the shop owner (blank template email, else first SIGN). */
function signerActionIdsForRecipient(actions: ZohoSignTemplateAction[]): Set<string> {
  const sign = actions.filter(a => a.action_type === 'SIGN' && a.action_id)
  const blank = sign.filter(a => !String(a.recipient_email ?? '').trim())
  const targets = blank.length > 0 ? blank : sign.slice(0, 1)
  return new Set(targets.map(a => a.action_id!))
}

function buildActionsPayload(
  actions: ZohoSignTemplateAction[],
  recipientName: string,
  recipientEmail: string
): Record<string, unknown>[] {
  const fillIds = signerActionIdsForRecipient(actions)
  return actions.map(a => {
    const fill = a.action_type === 'SIGN' && a.action_id && fillIds.has(a.action_id)
    return {
      action_id: a.action_id,
      action_type: a.action_type,
      recipient_name: fill ? recipientName : (a.recipient_name ?? ''),
      recipient_email: fill ? recipientEmail : (a.recipient_email ?? ''),
      signing_order: a.signing_order ?? 1,
      role: a.role ?? '',
      verify_recipient: Boolean(a.verify_recipient),
      private_notes: '',
    }
  })
}

/**
 * Create a request from a template and send it (is_quicksend=true).
 * @see https://www.zoho.com/sign/api/template-managment/send-documents-using-template.html
 */
export async function createAndSendDocument(params: {
  templateId: string
  recipientName: string
  recipientEmail: string
  /** Shown as the envelope / request name in Zoho Sign (e.g. "RepairWise Shop Agreement"). */
  requestName?: string
  fieldTextData: Record<string, string>
}): Promise<{ requestId: string }> {
  const token = await getZohoAccessToken()
  const { actions, requestNameDefault } = await getTemplateActions(token, params.templateId)

  const requestName =
    (params.requestName ?? process.env.ZOHO_SIGN_REQUEST_NAME)?.trim() ||
    requestNameDefault ||
    `RepairWise Agreement — ${params.recipientName}`

  const payload = {
    templates: {
      request_name: requestName,
      field_data: {
        field_text_data: params.fieldTextData,
        field_boolean_data: {},
        field_date_data: {},
        field_radio_data: {},
      },
      actions: buildActionsPayload(actions, params.recipientName, params.recipientEmail),
      notes: '',
    },
  }

  const form = new URLSearchParams()
  form.set('data', JSON.stringify(payload))
  form.set('is_quicksend', 'true')

  const createRes = await fetch(
    `${signApiBase()}/templates/${encodeURIComponent(params.templateId)}/createdocument`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  )

  const createText = await createRes.text()
  if (!createRes.ok) {
    throw new Error(`Zoho Sign create failed: ${createRes.status} ${createText}`)
  }

  const createData = JSON.parse(createText) as { requests?: { request_id?: string } }
  const requestId = createData.requests?.request_id
  if (!requestId) throw new Error(`Zoho Sign: no request_id in response`)

  return { requestId }
}

/** @see https://www.zoho.com/sign/api/document-managment/remind-recipient.html */
export async function remindSigningRequest(requestId: string): Promise<void> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}/remind`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Zoho Sign remind failed: ${res.status} ${text}`)
  }
}

/** @see https://www.zoho.com/sign/api/document-managment/recall-document.html */
export async function recallSigningRequest(requestId: string): Promise<void> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}/recall`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Zoho Sign recall failed: ${res.status} ${text}`)
  }
}

export function signerRecipientActionIds(actions: ZohoSignTemplateAction[]): string[] {
  return Array.from(signerActionIdsForRecipient(actions))
}

/** GET /requests/{request_id} — request name + actions (for action_id before update). */
export async function getSigningRequestSummary(requestId: string): Promise<{
  requestName: string
  actions: ZohoSignTemplateAction[]
}> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Zoho Sign get request failed: ${res.status} ${text}`)
  }
  const data = JSON.parse(text) as {
    requests?: {
      request_name?: string
      actions?: ZohoSignTemplateAction[]
    }
  }
  const req = data.requests
  if (!req) throw new Error('Zoho Sign: empty request details')
  const actions = req.actions ?? []
  if (!actions.length) throw new Error('Zoho Sign: request has no actions')
  const requestName = String(req.request_name ?? '').trim() || 'RepairWise Shop Agreement'
  return { requestName, actions }
}

/**
 * Update signer recipient on an existing request (after recall).
 * @see https://www.zoho.com/sign/api/document-managment/update-document.html
 */
export async function updateSigningRequestSignerRecipients(params: {
  requestId: string
  requestName: string
  signerActionIds: string[]
  recipientName: string
  recipientEmail: string
}): Promise<void> {
  if (!params.signerActionIds.length) {
    throw new Error('Zoho Sign: no signer actions to update')
  }
  const token = await getZohoAccessToken()
  const actions = params.signerActionIds.map(actionId => ({
    action_id: actionId,
    recipient_name: params.recipientName,
    recipient_email: params.recipientEmail,
    action_type: 'SIGN',
  }))
  const form = new URLSearchParams()
  form.set(
    'data',
    JSON.stringify({
      requests: {
        request_name: params.requestName,
        actions,
      },
    }),
  )
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(params.requestId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Zoho Sign update request failed: ${res.status} ${text}`)
  }
}

/** Resubmit a recalled/updated request for signature (strict). */
export async function submitSigningRequest(requestId: string): Promise<void> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Zoho Sign submit failed: ${res.status} ${text}`)
  }
}

/**
 * Same as {@link submitSigningRequest}, but treats Zoho error **12008** (“already submitted”) as success.
 * After a PUT update, many orgs’ envelopes are re-sent automatically; a follow-up POST /submit then
 * returns 12008. Other orgs need an explicit submit — this covers both.
 */
export async function submitSigningRequestIfNotAlreadySubmitted(requestId: string): Promise<void> {
  const token = await getZohoAccessToken()
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const text = await res.text()
  if (res.ok) return

  let parsed: { code?: number; message?: string } = {}
  try {
    parsed = JSON.parse(text) as { code?: number; message?: string }
  } catch {
    /* ignore */
  }
  const alreadySubmitted =
    parsed.code === 12008 ||
    /already submitted/i.test(String(parsed.message ?? '')) ||
    /already submitted/i.test(text)

  if (alreadySubmitted) return

  throw new Error(`Zoho Sign submit failed: ${res.status} ${text}`)
}

export async function getDocumentFields(
  requestId: string,
  existingAccessToken?: string
): Promise<Record<string, string>> {
  const token = existingAccessToken ?? (await getZohoAccessToken())
  const res = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) throw new Error(`Zoho Sign getFields failed: ${res.status}`)
  const data = await res.json()
  const fields: Record<string, string> = {}
  for (const action of data.requests?.actions ?? []) {
    for (const field of action.fields ?? []) {
      if (field.field_label && field.field_value != null) {
        fields[field.field_label] = field.field_value
      }
    }
  }
  return fields
}

/**
 * Download the generated request PDF for archival/storage.
 * Tries the primary request PDF endpoint first, then per-document endpoint if needed.
 */
export async function downloadRequestPdf(
  requestId: string,
  existingAccessToken?: string
): Promise<Uint8Array> {
  const token = existingAccessToken ?? (await getZohoAccessToken())

  async function getPdfFrom(path: string): Promise<Uint8Array | null> {
    const res = await fetch(`${signApiBase()}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
    if (!res.ok) return null

    if (!looksLikePdf(res.headers.get('content-type'))) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 100) return null
    return bytes
  }

  const merged = await getPdfFrom(
    `/requests/${encodeURIComponent(requestId)}/pdf?with_coc=true&merge=true`
  )
  if (merged) return merged

  const requestPdf = await getPdfFrom(`/requests/${encodeURIComponent(requestId)}/pdf`)
  if (requestPdf) return requestPdf

  const detailsRes = await fetch(`${signApiBase()}/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!detailsRes.ok) {
    throw new Error(`Zoho Sign request details failed: ${detailsRes.status}`)
  }
  const details = (await detailsRes.json()) as {
    requests?: { documents?: Array<{ document_id?: string }> }
  }
  const documentId = details.requests?.documents?.[0]?.document_id
  if (!documentId) {
    throw new Error(`Zoho Sign request ${requestId} has no downloadable documents`)
  }

  const perDoc = await getPdfFrom(
    `/requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(documentId)}/pdf`
  )
  if (perDoc) return perDoc

  throw new Error(`Failed to download Zoho Sign PDF for request ${requestId}`)
}

export function verifyWebhookToken(token: string): boolean {
  return token === process.env.ZOHO_SIGN_WEBHOOK_TOKEN
}
