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
