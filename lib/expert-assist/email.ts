import { Resend } from 'resend'

const resend = () => new Resend(process.env.RESEND_API_KEY?.trim() || 're_placeholder')

export async function sendConsultReceiptEmail(params: {
  to: string
  shopName: string
  amountLabel: string
  caseId: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    console.warn('sendConsultReceiptEmail: no RESEND_API_KEY')
    return
  }
  await resend().emails.send({
    from: process.env.RESEND_FROM?.trim() || 'Fixlane <onboarding@resend.dev>',
    to: params.to,
    subject: `Expert Assist receipt — ${params.shopName}`,
    text: `Your Expert Assist consult is closed.\n\nAmount charged: ${params.amountLabel}\nCase: ${params.caseId}\n\nThank you.`,
  })
}

export async function sendConsultBillingFailureEmail(params: {
  to: string
  shopName: string
  errorSummary: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    console.warn('sendConsultBillingFailureEmail: no RESEND_API_KEY')
    return
  }
  await resend().emails.send({
    from: process.env.RESEND_FROM?.trim() || 'Fixlane <onboarding@resend.dev>',
    to: params.to,
    subject: `Expert Assist — payment failed for ${params.shopName}`,
    text: `Payment for a recent Expert Assist consult failed.\n\n${params.errorSummary}\n\nPlease update your card in the billing link from your shop contact.`,
  })
}
