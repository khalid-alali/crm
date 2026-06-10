import { Resend } from 'resend'
import { laborRateFromAddress } from '@/lib/labor-rate-approval/config'
import {
  buildBodyHtml,
  buildBodyText,
  buildSubject,
  type LaborRateEmailContext,
} from '@/lib/labor-rate-approval/email-content'
import { laborRateThreadHeaders } from '@/lib/labor-rate-approval/thread'

export type { LaborRateEmailContext } from '@/lib/labor-rate-approval/email-content'
export { buildLaborRateEmailPreview } from '@/lib/labor-rate-approval/email-content'

export type SendLaborRateEmailOptions = {
  approvalId: string
  emailThreadMessageId?: string | null
}

function resendClient(): Resend {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

export async function sendLaborRateApprovalEmail(
  to: string[],
  ctx: LaborRateEmailContext,
  options: SendLaborRateEmailOptions,
): Promise<string | null> {
  if (to.length === 0) {
    throw new Error('No approver emails configured (LABOR_RATE_APPROVER_EMAILS)')
  }

  const subject = buildSubject(ctx)
  const text = buildBodyText(ctx)
  const html = buildBodyHtml(ctx)

  const { headers, newThreadMessageId } = laborRateThreadHeaders({
    existingThreadMessageId: options.emailThreadMessageId,
    approvalId: options.emailThreadMessageId ? undefined : options.approvalId,
  })

  const { error } = await resendClient().emails.send({
    from: laborRateFromAddress(),
    to,
    subject,
    text,
    html,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  })

  if (error) throw new Error(error.message)
  return newThreadMessageId
}
