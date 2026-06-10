import { normalizeRecipientList } from '@/lib/email-recipients'
import { notificationsFrom } from '@/lib/resend-notifications'

export function laborRateApproverEmails(): string[] {
  const raw = process.env.LABOR_RATE_APPROVER_EMAILS?.trim() ?? ''
  if (!raw) return []
  return normalizeRecipientList(raw.split(',').map(s => s.trim()).filter(Boolean))
}

export function laborRateEscalationEmail(): string | null {
  const raw = process.env.LABOR_RATE_ESCALATION_EMAIL?.trim() ?? ''
  if (!raw) return null
  try {
    return normalizeRecipientList([raw])[0] ?? null
  } catch {
    return null
  }
}

export function laborRateFromAddress(): string {
  const local = process.env.LABOR_RATE_FROM_LOCAL_PART?.trim() || 'labor-rate-approval'
  return notificationsFrom('RepairWise Labor Rate', local)
}

export function laborRatePublicBaseUrl(): string {
  const portalPublic = process.env.PORTAL_PUBLIC_BASE_URL?.trim().replace(/\/$/, '')
  if (portalPublic) return portalPublic
  const env = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, '')
  if (env) return env
  return 'http://localhost:3000'
}
