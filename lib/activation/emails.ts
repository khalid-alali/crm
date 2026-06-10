import { Resend } from 'resend'
import { sendOwnerEmailByGap, type OwnerGapEmailVariant } from '@/lib/activation/drip'
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
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { sendTwilioSmsWithoutLog } from '@/lib/expert-assist/send-sms'
import { supabaseAdmin } from '@/lib/supabase'

const resend = () => new Resend(process.env.RESEND_API_KEY?.trim() || 're_placeholder')

async function sendOwnerEmail(params: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    console.warn('activation email: no RESEND_API_KEY', params.subject)
    return
  }
  const { error } = await resend().emails.send({
    from: process.env.RESEND_FROM?.trim() || 'Fixlane <onboarding@resend.dev>',
    to: params.to,
    subject: params.subject,
    text: params.text,
  })
  if (error) throw new Error(error.message)
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
export async function sendWelcomeOwnerEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  const partner = requireCasePartner(ctx)
  const forwardUrl = ownerForwardCtaUrl(ctx.locationId)
  const counterUrl = counterCardDiagnoseUrl(partner)
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)

  await sendOwnerEmail({
    to,
    subject: `Welcome to Expert Assist — ${ctx.shopName}`,
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
export async function sendOwnerGapEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  const variant = sendOwnerEmailByGap(ctx)
  const { subject, text } = ownerGapEmailContent(ctx, variant)
  await sendOwnerEmail({ to, subject, text })
}

async function sendServiceWriterEmail(params: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  await sendOwnerEmail(params)
}

/** Sent at signup — setup instructions for the designated service writer (email only). */
export async function sendServiceWriterSetupEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return

  const tollFree = expertAssistTollFreeNumber()
  const shopCode = await loadShopShortCode(ctx.locationId)
  const codeLine = shopCode ? ` Include shop code ${shopCode} in your first message.` : ''
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)

  await sendServiceWriterEmail({
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
export async function sendServiceWriterNudge1Email(ctx: ActivationStateView): Promise<void> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return
  const tollFree = expertAssistTollFreeNumber()

  await sendServiceWriterEmail({
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
export async function sendServiceWriterNudge2Email(ctx: ActivationStateView): Promise<void> {
  const to = ctx.serviceWriterEmail?.trim()
  if (!to) return
  const tollFree = expertAssistTollFreeNumber()

  await sendServiceWriterEmail({
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

async function sendFrontDeskSms(ctx: ActivationStateView, body: string): Promise<void> {
  const raw = ctx.frontDeskPhone?.trim()
  if (!raw) return
  const to = normalizeSmsAddress(raw)
  if (!to) return
  await sendTwilioSmsWithoutLog(to, body)
}

export async function sendMoneyKeptEmail(ctx: ActivationStateView, consultId: string): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  const partner = ctx.toolboxCasePartner?.trim()
  const toolkitBlock =
    partner ?
      [
        ``,
        `Optional: share your Toolbox referral link with customers:`,
        toolboxDiagnoseUrl(partner, { utmMedium: 'toolkit' }),
      ]
    : []

  await sendOwnerEmail({
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

export async function sendActiveReferralPushEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  const partner = requireCasePartner(ctx)
  await sendOwnerEmail({
    to,
    subject: `You're Active on Expert Assist — ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `Congrats — ${ctx.shopName} is now Active on Expert Assist.`,
      ``,
      `Share your referral link with customers:`,
      toolboxDiagnoseUrl(partner, { utmSource: 'shop', utmMedium: 'toolkit' }),
      ``,
      `Shop toolkit: ${expertAssistToolkitUrl(ctx.locationId)}`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

export async function sendMuscleMemoryEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  await sendOwnerEmail({
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

export async function sendReactivationEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  await sendOwnerEmail({
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

export async function sendReferralBookedOwnerEmail(
  ctx: ActivationStateView,
  referralId: string,
): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  await sendOwnerEmail({
    to,
    subject: `Customer referral booked — ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `A customer referral tied to ${ctx.shopName} was booked (ref ${referralId}).`,
      `Great work closing the loop — we'll keep you posted on outcomes.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}

/** After counter-card printout photo — unlock complimentary consult for front desk. */
export async function sendPrintoutPhotoFrontDeskSms(ctx: ActivationStateView): Promise<void> {
  const tollFree = expertAssistTollFreeNumber()
  const shopCode = await loadShopShortCode(ctx.locationId)
  const codeLine = shopCode ? ` Use shop code ${shopCode}.` : ''
  await sendFrontDeskSms(
    ctx,
    `Thanks for sending your counter card photo for ${ctx.shopName}! Your complimentary consult is unlocked — text ${tollFree} with a VIN or question.${codeLine}`,
  )
}

export async function sendPhotoReceivedOwnerEmail(ctx: ActivationStateView): Promise<void> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return
  await sendOwnerEmail({
    to,
    subject: `Printout received — free consult unlocked for ${ctx.shopName}`,
    text: [
      greeting(ctx),
      ``,
      `We received your counter-card printout photo. Your complimentary consult is unlocked — have your team text our Expert Assist line to start.`,
      ``,
      `— RepairWise`,
    ].join('\n'),
  })
}
