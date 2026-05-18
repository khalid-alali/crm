/** Twilio Messaging Service SID (MG + 32 hex chars). */
export const TWILIO_MESSAGING_SERVICE_SID_RE = /^MG[0-9a-fA-F]{32}$/

export function resolveTwilioMessagingOpts(): { messagingServiceSid?: string; from?: string } {
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
  const from = process.env.TWILIO_FROM_NUMBER?.trim()

  if (msid && TWILIO_MESSAGING_SERVICE_SID_RE.test(msid)) {
    return { messagingServiceSid: msid }
  }

  if (msid) {
    console.warn(
      'TWILIO_MESSAGING_SERVICE_SID is set but invalid (must be MG + 32 hex). Falling back to TWILIO_FROM_NUMBER.'
    )
  }

  if (from) return { from }

  if (msid) {
    throw new Error(
      'TWILIO_MESSAGING_SERVICE_SID is invalid. Use a Messaging Service SID from Twilio Console (starts with MG), or set TWILIO_FROM_NUMBER.'
    )
  }

  throw new Error('Set TWILIO_MESSAGING_SERVICE_SID (MG…) or TWILIO_FROM_NUMBER')
}

export function formatTwilioSendError(err: unknown): string {
  if (err && typeof err === 'object') {
    const o = err as { code?: number; message?: string; moreInfo?: string }
    if (o.code === 21705) {
      return 'Twilio rejected the Messaging Service SID (error 21705). Set TWILIO_MESSAGING_SERVICE_SID to a valid MG… value from Twilio Console, or use TWILIO_FROM_NUMBER only.'
    }
    if (o.code === 21620) {
      return 'Twilio could not fetch the image URL for MMS. Ensure TWILIO_WEBHOOK_BASE_URL is a public HTTPS URL (e.g. ngrok in local dev).'
    }
    if (o.code === 95111) {
      return 'Twilio could not download the MMS image (unauthorized or expired URL).'
    }
    if (typeof o.message === 'string' && o.message) return o.message
  }
  return err instanceof Error ? err.message : 'Failed to send message'
}
