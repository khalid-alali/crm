export const EMAIL_ACTIVITY_FOOTER_RE = /\n\n—\s*Sent from shop detail \(Email\)\s*$/i

export function stripEmailActivityFooter(body: string): string {
  return body.replace(EMAIL_ACTIVITY_FOOTER_RE, '')
}

/** Collapse whitespace to a single line for previews. */
export function collapsePlainText(body: string): string {
  return stripEmailActivityFooter(body).replace(/\s+/g, ' ').trim()
}

/**
 * Remove a common one-line salutation so list previews start with substance.
 * e.g. "Hi Khalid, I hope" → "I hope"
 */
export function stripLeadingSalutation(singleLine: string): string {
  return singleLine
    .replace(/^(Hi|Hello|Hey|Greetings|Good\s+(morning|afternoon|evening)|Dear)\s+[^,!.]{1,48}[,!.]?\s+/i, '')
    .trim()
}

export function activityPreviewPlain(
  body: string,
  maxLen: number,
  options?: { stripGreeting?: boolean },
): string {
  let t = collapsePlainText(body)
  if (options?.stripGreeting) t = stripLeadingSalutation(t)
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`
}

export function bodyNeedsDrawer(rawBody: string, threshold = 80): boolean {
  const s = stripEmailActivityFooter(rawBody).trim()
  if (!s) return false
  const singleLine = s.replace(/\s+/g, ' ').trim()
  return s.includes('\n') || singleLine.length > threshold
}

export type ActivityRecipientsParsed = { to: string[]; cc: string[] }

/** Parse `activity_log.recipients` JSONB; returns null if missing or invalid. */
export function parseActivityRecipients(recipients: unknown): ActivityRecipientsParsed | null {
  if (!recipients || typeof recipients !== 'object') return null
  const o = recipients as Record<string, unknown>
  const to = Array.isArray(o.to)
    ? o.to.filter((x): x is string => typeof x === 'string').map(x => x.trim())
    : []
  const cc = Array.isArray(o.cc)
    ? o.cc.filter((x): x is string => typeof x === 'string').map(x => x.trim())
    : []
  if (to.length === 0 && cc.length === 0) return null
  return { to, cc }
}

/** True when the activity drawer should open to see full To/Cc (list view stays unchanged). */
export function activityEmailNeedsRecipientDrawer(recipients: unknown): boolean {
  const p = parseActivityRecipients(recipients)
  if (!p) return false
  return p.to.length > 1 || p.cc.length > 0
}

/** One-line summary for the activity list (below subject). Null when a single To and no Cc. */
export function emailActivityCompactRecipientSummary(
  recipients: unknown,
  nameByEmailLower?: Record<string, string>,
): string | null {
  const p = parseActivityRecipients(recipients)
  if (!p || p.to.length === 0) return null
  if (p.to.length === 1 && p.cc.length === 0) return null

  const localPart = (e: string) => {
    const at = e.indexOf('@')
    return at > 0 ? e.slice(0, at) : e
  }
  const label = (e: string) => nameByEmailLower?.[e.toLowerCase()]?.trim() || localPart(e)

  const firstTo = p.to[0]!
  let out = `Sent to ${label(firstTo)}`
  if (p.to.length > 1) {
    const n = p.to.length - 1
    out += ` + ${n} other${n === 1 ? '' : 's'}`
  }
  if (p.cc.length === 1) {
    out += ` · cc ${label(p.cc[0]!)}`
  } else if (p.cc.length > 1) {
    const n = p.cc.length - 1
    out += ` · cc ${label(p.cc[0]!)} + ${n} other${n === 1 ? '' : 's'}`
  }
  return out
}

/** Drawer line: comma-separated `Name <email>` when lookup provides names; else raw emails. */
export function formatRecipientDrawerSegment(
  emails: string[],
  nameByEmailLower?: Record<string, string | null | undefined>,
): string {
  if (emails.length === 0) return ''
  return emails
    .map(e => {
      const lower = e.toLowerCase()
      const name = nameByEmailLower?.[lower]?.trim()
      if (name) return `${name} <${e}>`
      return e
    })
    .join(', ')
}
