import type { ActivationStateView } from '@/lib/activation/types'

/** First token of a contact name for salutation; falls back per message style. */
export function lifecycleFirstName(full: string | null | undefined, fallback = 'there'): string {
  const trimmed = full?.trim()
  if (!trimmed) return fallback
  return trimmed.split(/\s+/)[0] ?? fallback
}

function ownerSalutation(ctx: ActivationStateView): string {
  return lifecycleFirstName(ctx.ownerName)
}

function frontDeskSalutation(ctx: ActivationStateView): string {
  return lifecycleFirstName(ctx.serviceWriterName, 'there')
}

export function invite1Email(ctx: ActivationStateView, setupUrl: string) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Tesla Expert Assist is live — you’re first in line',
    text: [
      `${name} — we spent the last few months building Expert Assist for shops exactly like yours. It’s ready.`,
      ``,
      `Tesla rolls in. Your service writer texts us the VIN and a question. A mastertech calls back in minutes. You keep the job, the customer, the $800+.`,
      ``,
      `First consult’s on the house. Takes two minutes to get set up.`,
      ``,
      setupUrl,
      `(your link’s good for 7 days)`,
    ].join('\n'),
  }
}

export function invite2Email(ctx: ActivationStateView, setupUrl: string) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Your Expert Assist setup link expires in 3 days',
    text: [
      `${name} — two minutes of setup is all that’s standing between your shop and the next Tesla job you’d normally turn away. First consult’s free.`,
      ``,
      setupUrl,
    ].join('\n'),
  }
}

export function invite3Email(ctx: ActivationStateView, setupUrl: string) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Last call — your link dies tomorrow',
    text: [
      `${name} — after tomorrow this link’s gone. Two minutes if you want it:`,
      ``,
      setupUrl,
    ].join('\n'),
  }
}

export const CC1_COUNTER_CARD_SMS =
  'That counter card doing its job yet? Tape it up where you write ROs, snap a photo, text it back here — that unlocks another free consult.'

export const CC2A_PHOTO_RECEIVED_SMS =
  'Card’s up, free consult’s unlocked. Next Tesla that rolls in, text us the VIN + your question before you say no. We’ve got you.'

export function cc2bPhotoReceivedOwnerEmail(ctx: ActivationStateView, toolkitUrl: string) {
  const owner = ownerSalutation(ctx)
  const frontDesk = ctx.serviceWriterName?.trim() || 'Your service writer'
  return {
    subject: 'Your front desk is ready',
    text: [
      `${owner} — ${frontDesk} put the Expert Assist card up at the counter. Next Tesla that rolls in, they have everything they need.`,
      ``,
      toolkitUrl,
    ].join('\n'),
  }
}

export function kit1WelcomeKitShippedEmail(
  ctx: ActivationStateView,
  trackingUrl: string,
) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Your counter kit is on the way',
    text: [
      `${name} — placard and stickers ship today (${trackingUrl}). One rule when it lands: the placard goes where your service writer writes ROs, not on a bay wall. Wall placards go invisible by day two. Counter placards get used.`,
      ``,
      trackingUrl,
    ].join('\n'),
  }
}

export const ACT2_FIRST_CONSULT_SMS =
  'First consult’s in the books. Same number, same move — VIN + whatever’s got you stuck, mastertech calls back. Every Tesla from here works the same way.'

export function refPush1Email(ctx: ActivationStateView, toolkitUrl: string) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Two consults in. Here’s the bigger play.',
    text: [
      `${name} — your team’s used Expert Assist twice now.`,
      ``,
      `When a Tesla job is bigger than a consult — full diagnostic, deep electrical, the work you don’t want in your bays — don’t turn the customer away. Hand them to us. We diagnose remotely and send the hands-on repair work right back to you. They stay your customer the whole way through.`,
      ``,
      `Your handoff toolkit has your shop’s link and QR code. Print it, save it, or text it to a customer in one tap.`,
      ``,
      toolkitUrl,
    ].join('\n'),
  }
}

export const REF_PUSH2_SMS =
  'When a Tesla job’s bigger than the shop can take, don’t say no — use the QR code on your counter card. Customer gets the remote diag, repair comes back to you.'

export function ref2ReferralBookedEmail(ctx: ActivationStateView) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Your customer just booked',
    text: [
      `${name} — the Tesla customer you sent over just booked their remote diagnostic. When the diag’s done, the hands-on work routes back to your shop. That’s the handoff doing exactly what it’s supposed to.`,
    ].join('\n'),
  }
}

export const DOR75_WINBACK_SMS =
  'Been a minute. Next Tesla that stumps you, that consult’s on us — VIN + one-line question to this number, mastertech calls you back, you keep the Tesla in your bay.'

export function bill1ChargeFailedEmail(
  ctx: ActivationStateView,
  amountLabel: string,
  updateCardUrl: string,
) {
  const name = ownerSalutation(ctx)
  return {
    subject: 'Your card didn’t go through',
    text: [
      `${name} — your card on file got declined for ${amountLabel}. Takes 30 seconds to fix, and consults are paused until it’s sorted — you don’t want the next Tesla rolling in while we’re on hold.`,
      ``,
      updateCardUrl,
    ].join('\n'),
  }
}

export function bill2ChargeFailedSms(updateCardUrl: string): string {
  return `Quick one — your Expert Assist card needs updating before your next consult: ${updateCardUrl}. 30 seconds.`
}

export function consultReceiptEmail(params: {
  shopName: string
  amountLabel: string
  caseId: string
}) {
  return {
    subject: `Expert Assist receipt — ${params.shopName}`,
    text: [
      `Your Expert Assist consult is closed.`,
      ``,
      `Amount charged: ${params.amountLabel}`,
      `Case: ${params.caseId}`,
      ``,
      `Thank you.`,
    ].join('\n'),
  }
}

export function consultReceiptSms(amountLabel: string, caseId: string): string {
  return `Expert Assist consult closed. Billed ${amountLabel} to card on file. Case ${caseId}.`
}
