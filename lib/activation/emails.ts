import { Resend } from 'resend'
import type { ActivationActivityLogMeta } from '@/lib/activation/activity-log'
import { sendOwnerEmailByGap, type OwnerGapEmailVariant } from '@/lib/activation/drip'
import { requireResendConfig } from '@/lib/activation/runtime-env'
import {
  counterCardDiagnoseUrl,
  counterCardDownloadUrl,
  expertAssistToolkitUrl,
  expertAssistTollFreeNumber,
  ownerForwardCtaUrl,
  toolboxDiagnoseUrl,
} from '@/lib/activation/urls'
import type { ActivationStateView } from '@/lib/activation/types'
import { sendConsultReceiptEmail } from '@/lib/expert-assist/email'
import {
  sendPhotoReceivedOwnerEmail,
  sendPrintoutPhotoFrontDeskSms,
  sendReferralBookedOwnerEmail,
} from '@/lib/activation/lifecycle-emails'
import { supabaseAdmin } from '@/lib/supabase'

async function sendOwnerEmail(params: {
  to: string
  subject: string
  text: string
}): Promise<ActivationActivityLogMeta> {
  const { apiKey, from } = requireResendConfig(params.subject)
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  })
  if (error) throw new Error(error.message)
  return {
    channel: 'email',
    to: params.to,
    subject: params.subject,
    body: params.text,
  }
}

function greeting(ctx: ActivationStateView): string {
  const name = ctx.ownerName?.trim()
  return name ? `Hi ${name},` : 'Hi,'
}

function serviceWriterGreeting(ctx: ActivationStateView): string {
  const name = ctx.serviceWriterName?.trim()
  return name ? `Hi ${name},` : 'Hi,'
}

function requireCasePartner(ctx: ActivationStateView): string {
  const partner = ctx.toolboxCasePartner?.trim()
  if (!partner) throw new Error(`toolbox_case_partner missing for ${ctx.locationId}`)
  return partner
}

async function loadShopShortCode(locationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('consult_short_code')
    .eq('id', locationId)
    .maybeSingle()
  return (data as { consult_short_code: string | null } | null)?.consult_short_code?.trim() ?? null
}

/** T0 — owner welcome with forward CTA + counter-card diagnose link (casePartner only). */
export async function sendWelcomeOwnerEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const partner = requireCasePartner(ctx)
  const forwardUrl = ownerForwardCtaUrl(ctx.locationId)
  const counterUrl = counterCardDiagnoseUrl(partner)
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)
  const subject = `Welcome to Expert Assist — ${ctx.shopName}`

  return sendOwnerEmail({
    to,
    subject,
    text: [
      greeting(ctx),
      ``,
      `${ctx.shopName} is enrolled in Expert Assist. Here's how to get your team started:`,
      ``,
      `1) Forward this to your service writers (tracks when they open it):`,
      forwardUrl,
      ``,
      `2) Print your counter card QR — customers scan to start a Toolbox referral:`,
      counterUrl,
      ``,
      `3) Your shop toolkit (referral links + resources):`,
      toolkitUrl,
      ``,
      `We'll check in over the next two weeks if we haven't heard from your team yet.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

function ownerGapEmailContent(
  ctx: ActivationStateView,
  variant: OwnerGapEmailVariant,
): { subject: string; text: string } {
  const partner = ctx.toolboxCasePartner?.trim() ?? 'your-shop'
  const base = [greeting(ctx), ``]

  if (variant === 'forward_cta') {
    return {
      subject: `Forward Expert Assist to your team — ${ctx.shopName}`,
      text: [
        ...base,
        `Your service writer hasn't started an Expert Assist consult yet.`,
        ``,
        `Forward this note so they know how to reach us:`,
        ownerForwardCtaUrl(ctx.locationId),
        ``,
        `— RepairWise`,
      ].join('\n'),
    }
  }

  if (variant === 'counter_card') {
    return {
      subject: `Print your Expert Assist counter card — ${ctx.shopName}`,
      text: [
        ...base,
        `Put a counter card where customers wait — the QR sends them to Toolbox with your shop credited:`,
        counterCardDiagnoseUrl(partner),
        ``,
        `Download the printable PDF:`,
        counterCardDownloadUrl(ctx.locationId),
        ``,
        `— RepairWise`,
      ].join('\n'),
    }
  }

  return {
    subject: `Expert Assist economics — ${ctx.shopName}`,
    text: [
      ...base,
      `Quick reminder on how Expert Assist pays off:`,
      `- First consult is complimentary for eligible shops`,
      `- You keep customer relationships — we help diagnose and refer when it makes sense`,
      `- Active shops share their referral link: ${toolboxDiagnoseUrl(partner, { utmMedium: 'toolkit' })}`,
      ``,
      `Questions? Reply to this email or text CALL from an approved shop phone.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  }
}

/** T+5 — owner email by activation checkbox gap. */
export async function sendOwnerGapEmail(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const variant = sendOwnerEmailByGap(ctx)
  const { subject, text } = ownerGapEmailContent(ctx, variant)
  return sendOwnerEmail({ to, subject, text })
}

async function sendServiceWriterEmail(params: {
  to: string
  subject: string
  text: string
}): Promise<ActivationActivityLogMeta> {
  return sendOwnerEmail(params)
}

export {
  sendPhotoReceivedOwnerEmail,
  sendPrintoutPhotoFrontDeskSms,
  sendReferralBookedOwnerEmail,
} from '@/lib/activation/lifecycle-emails'

/** Sent at signup — setup instructions for the designated service writer (email only). */
export async function sendServiceWriterSetupEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return null

  const tollFree = expertAssistTollFreeNumber()
  const shopCode = await loadShopShortCode(ctx.locationId)
  const codeLine = shopCode ? ` Include shop code ${shopCode} in your first message.` : ''
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)

  return sendServiceWriterEmail({
    to,
    subject: `Expert Assist setup — ${ctx.shopName}`,
    text: [
      serviceWriterGreeting(ctx),
      ``,
      `${ctx.shopName} is enrolled in Expert Assist. You're the service writer who reaches out when a Tesla rolls in.`,
      ``,
      `To start a consult, text ${tollFree} with a VIN, photo, or question. You initiate the thread — we won't text you first.${codeLine}`,
      ``,
      `Shop toolkit (referral links + resources):`,
      toolkitUrl,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

/** T+2 — service writer email nudge. */
export async function sendServiceWriterNudge1Email(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return null
  const tollFree = expertAssistTollFreeNumber()

  return sendServiceWriterEmail({
    to,
    subject: `Try Expert Assist — ${ctx.shopName}`,
    text: [
      serviceWriterGreeting(ctx),
      ``,
      `Quick reminder — Expert Assist is live for ${ctx.shopName}.`,
      `Text ${tollFree} with a VIN or photo when you have a Tesla in the bay.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

/** T+7 — service writer email nudge. */
export async function sendServiceWriterNudge2Email(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return null
  const tollFree = expertAssistTollFreeNumber()

  return sendServiceWriterEmail({
    to,
    subject: `Expert Assist check-in — ${ctx.shopName}`,
    text: [
      serviceWriterGreeting(ctx),
      ``,
      `We haven't seen a consult from ${ctx.shopName} yet.`,
      `When you're ready, text ${tollFree} with a VIN or question to start.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

export async function sendMoneyKeptEmail(
  ctx: ActivationStateView,
  consultId: string,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const partner = ctx.toolboxCasePartner?.trim()
  const toolkitBlock =
    partner ?
      [
        ``,
        `Optional: share your Toolbox referral link with customers:`,
        toolboxDiagnoseUrl(partner, { utmMedium: 'toolkit' }),
      ]
    : []

  return sendOwnerEmail({
    to,
    subject: `Expert Assist consult closed — ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `Your shop just completed an Expert Assist consult (case ${consultId}).`,
      `We'll follow up with referral toolkit tips as you build momentum.`,
      ...toolkitBlock,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

export async function sendConsultReceiptIfPaid(params: {
  ctx: ActivationStateView
  consultId: string
  amountLabel: string
  paid: boolean
}): Promise<void> {
  if (!params.paid) return
  const to = params.ctx.ownerEmail?.trim()
  if (!to) return
  await sendConsultReceiptEmail({
    to,
    shopName: params.ctx.shopName,
    amountLabel: params.amountLabel,
    caseId: params.consultId,
  })
}

export { sendRefPush1Email as sendActiveReferralPushEmail, sendRefPush1Email } from '@/lib/activation/lifecycle-emails'

export async function sendMuscleMemoryEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  return sendOwnerEmail({
    to,
    subject: `Quick check-in — Expert Assist at ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `It's been a few weeks since your last Expert Assist consult.`,
      ``,
      `Remind your team: text CALL to request a walkthrough, or send a case anytime.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

export async function sendReactivationEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  return sendOwnerEmail({
    to,
    subject: `Let's re-activate Expert Assist — ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `We haven't seen a consult from ${ctx.shopName} in a while.`,
      ``,
      `Reply to your shop thread or contact your Fixlane rep to get rolling again.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}
