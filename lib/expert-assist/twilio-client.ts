import twilio from 'twilio'

/**
 * Twilio REST: API Key (SK…) + secret + Account SID.
 * @see https://www.twilio.com/docs/usage/api#authenticate-with-api-keys
 */
export function getTwilioRestClient(): ReturnType<typeof twilio> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim()
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim()
  const legacyToken = process.env.TWILIO_AUTH_TOKEN?.trim()

  if (!accountSid) {
    throw new Error('Missing TWILIO_ACCOUNT_SID')
  }

  if (apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid })
  }

  if (legacyToken) {
    return twilio(accountSid, legacyToken)
  }

  throw new Error('Set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (recommended), or TWILIO_AUTH_TOKEN for legacy')
}

/**
 * Twilio signs inbound webhooks with your **primary Account Auth Token** (not the API key secret).
 * Set TWILIO_WEBHOOK_AUTH_TOKEN to that value, or legacy TWILIO_AUTH_TOKEN.
 */
export function getTwilioWebhookSigningSecret(): string | undefined {
  return (
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim() ||
    process.env.TWILIO_AUTH_TOKEN?.trim() ||
    undefined
  )
}

/** Basic auth for Twilio media URLs: API key preferred; else Account SID + Auth Token. */
export function getTwilioBasicAuthHeader(): string | null {
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim()
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim()
  if (apiKeySid && apiKeySecret) {
    return `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')}`
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const legacyToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (accountSid && legacyToken) {
    return `Basic ${Buffer.from(`${accountSid}:${legacyToken}`).toString('base64')}`
  }
  return null
}
