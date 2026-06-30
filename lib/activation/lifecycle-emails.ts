import type { ActivationActivityLogMeta } from '@/lib/activation/activity-log'
import type { ActivationStateView } from '@/lib/activation/types'
import {
  ACT2_FIRST_CONSULT_SMS,
  CC1_COUNTER_CARD_SMS,
  CC2A_PHOTO_RECEIVED_SMS,
  REF_PUSH2_SMS,
  DOR75_WINBACK_SMS,
  bill1ChargeFailedEmail,
  bill2ChargeFailedSms,
  cc2bPhotoReceivedOwnerEmail,
  invite1Email,
  invite2Email,
  invite3Email,
  kit1WelcomeKitShippedEmail,
  ref2ReferralBookedEmail,
  refPush1Email,
} from '@/lib/activation/lifecycle-copy'
import {
  expertAssistShopSetupUrl,
  expertAssistUpdateCardUrl,
} from '@/lib/activation/lifecycle-urls'
import { expertAssistToolkitUrl } from '@/lib/activation/urls'
import { requireResendConfig } from '@/lib/activation/runtime-env'
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { sendTwilioSmsWithoutLog } from '@/lib/expert-assist/send-sms'
import { Resend } from 'resend'

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

async function sendFrontDeskSms(
  ctx: ActivationStateView,
  body: string,
  subject: string,
): Promise<ActivationActivityLogMeta | null> {
  const raw = ctx.frontDeskPhone?.trim()
  if (!raw) return null
  const to = normalizeSmsAddress(raw)
  if (!to) return null
  await sendTwilioSmsWithoutLog(to, body)
  return { channel: 'sms', to, subject, body }
}

export async function sendInvite1Email(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const { subject, text } = invite1Email(ctx, expertAssistShopSetupUrl(ctx.locationId))
  return sendOwnerEmail({ to, subject, text })
}

export async function sendInvite2Email(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const { subject, text } = invite2Email(ctx, expertAssistShopSetupUrl(ctx.locationId))
  return sendOwnerEmail({ to, subject, text })
}

export async function sendInvite3Email(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const { subject, text } = invite3Email(ctx, expertAssistShopSetupUrl(ctx.locationId))
  return sendOwnerEmail({ to, subject, text })
}

export async function sendCounterCardPhotoChaseSms(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  return sendFrontDeskSms(ctx, CC1_COUNTER_CARD_SMS, 'Counter card photo chase (CC-1)')
}

export async function sendPrintoutPhotoFrontDeskSms(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  return sendFrontDeskSms(ctx, CC2A_PHOTO_RECEIVED_SMS, 'Printout photo received (CC-2A)')
}

export async function sendPhotoReceivedOwnerEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)
  const { subject, text } = cc2bPhotoReceivedOwnerEmail(ctx, toolkitUrl)
  return sendOwnerEmail({ to, subject, text })
}

export async function sendWelcomeKitShippedEmail(
  ctx: ActivationStateView,
  trackingUrl?: string | null,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const tracking = trackingUrl?.trim() || 'tracking link pending'
  const { subject, text } = kit1WelcomeKitShippedEmail(ctx, tracking)
  return sendOwnerEmail({ to, subject, text })
}

export async function sendPostFirstConsultFrontDeskSms(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  return sendFrontDeskSms(ctx, ACT2_FIRST_CONSULT_SMS, 'Post-first-consult follow-up (ACT2-1)')
}

export async function sendRefPush1Email(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const toolkitUrl = expertAssistToolkitUrl(ctx.locationId)
  const { subject, text } = refPush1Email(ctx, toolkitUrl)
  return sendOwnerEmail({ to, subject, text })
}

/** @deprecated Use sendRefPush1Email — fires on 2nd consult, not stage transition. */
export const sendActiveReferralPushEmail = sendRefPush1Email

export async function sendRefPush2Sms(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  return sendFrontDeskSms(ctx, REF_PUSH2_SMS, 'Referral push follow-up (REF-PUSH-2)')
}

export async function sendReferralBookedOwnerEmail(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const { subject, text } = ref2ReferralBookedEmail(ctx)
  return sendOwnerEmail({ to, subject, text })
}

export async function sendDor75WinbackSms(ctx: ActivationStateView): Promise<ActivationActivityLogMeta | null> {
  return sendFrontDeskSms(ctx, DOR75_WINBACK_SMS, 'Win-back SMS (DOR-75)')
}

export async function sendBillingFailureOwnerEmail(
  ctx: ActivationStateView,
  amountLabel: string,
): Promise<ActivationActivityLogMeta | null> {
  const to = ctx.ownerEmail?.trim()
  if (!to) return null
  const updateUrl = expertAssistUpdateCardUrl(ctx.locationId)
  const { subject, text } = bill1ChargeFailedEmail(ctx, amountLabel, updateUrl)
  return sendOwnerEmail({ to, subject, text })
}

export async function sendBillingDunningOwnerSms(
  ctx: ActivationStateView,
): Promise<ActivationActivityLogMeta | null> {
  const raw = ctx.ownerPhone?.trim()
  if (!raw) return null
  const to = normalizeSmsAddress(raw)
  if (!to) return null
  const updateUrl = expertAssistUpdateCardUrl(ctx.locationId)
  const body = bill2ChargeFailedSms(updateUrl)
  await sendTwilioSmsWithoutLog(to, body)
  return {
    channel: 'sms',
    to,
    subject: 'Billing dunning SMS (BILL-2)',
    body,
  }
}
