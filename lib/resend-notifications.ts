const domain = () =>
  (process.env.RESEND_NOTIFICATIONS_DOMAIN ?? 'notifications.fixlane.com').trim() ||
  'notifications.fixlane.com'

/** Lowercase local part safe for Resend / typical SMTP rules. */
export function sanitizeNotificationsLocalPart(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/^[.-]+|[.-]+$/g, '')
  const part = s.length > 0 ? s.slice(0, 64) : 'team'
  return part
}

export function notificationsFrom(displayName: string, localPart: string): string {
  const safeLocal = sanitizeNotificationsLocalPart(localPart)
  const address = `${safeLocal}@${domain()}`
  const trimmed = displayName.trim() || 'RepairWise'
  if (trimmed.includes(',') || /[<>"\\]/.test(trimmed)) {
    return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${address}>`
  }
  return `${trimmed} <${address}>`
}

/** First segment of display name, else email local-part, for per-user From address. */
export function firstNameLocalFromSessionUser(user: {
  name?: string | null
  email?: string | null
}): string {
  const name = user.name?.trim()
  if (name) {
    const first = name.split(/\s+/)[0] ?? name
    return sanitizeNotificationsLocalPart(first)
  }
  const email = user.email?.trim()
  if (email) {
    const local = email.split('@')[0] ?? ''
    return sanitizeNotificationsLocalPart(local)
  }
  return 'team'
}
