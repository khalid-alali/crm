import { Resend } from 'resend'
import { consultReceiptEmail } from '@/lib/activation/lifecycle-copy'
import { requireResendConfig } from '@/lib/activation/runtime-env'

export async function sendConsultReceiptEmail(params: {
  to: string
  shopName: string
  amountLabel: string
  caseId: string
}): Promise<void> {
  const { apiKey, from } = requireResendConfig('Expert Assist consult receipt')
  const { subject, text } = consultReceiptEmail(params)
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: params.to,
    subject,
    text,
  })
  if (error) throw new Error(error.message)
}

export async function sendConsultBillingFailureEmail(params: {
  to: string
  shopName: string
  amountLabel: string
  updateCardUrl: string
  ownerName?: string | null
}): Promise<void> {
  const { apiKey, from } = requireResendConfig('Expert Assist billing failure')
  const name = params.ownerName?.trim()?.split(/\s+/)[0] ?? 'there'
  const { subject, text } = {
    subject: 'Your card didn’t go through',
    text: [
      `${name} — your card on file got declined for ${params.amountLabel}. Takes 30 seconds to fix, and consults are paused until it’s sorted — you don’t want the next Tesla rolling in while we’re on hold.`,
      ``,
      params.updateCardUrl,
    ].join('\n'),
  }
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: params.to,
    subject,
    text,
  })
  if (error) throw new Error(error.message)
}
