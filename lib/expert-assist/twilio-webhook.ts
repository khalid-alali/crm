import twilio from 'twilio'
import { getTwilioWebhookSigningSecret } from '@/lib/expert-assist/twilio-client'

/** Twilio X-Twilio-Signature validation for application/x-www-form-urlencoded webhooks. */
export function verifyTwilioRequest(signature: string | undefined, url: string, params: Record<string, string>): boolean {
  const token = getTwilioWebhookSigningSecret()
  if (!token || !signature) return false
  return twilio.validateRequest(token, signature, url, params)
}

/** Full URL Twilio posted to (must match webhook config), incl. querystring if any. */
export function inboundSmsWebhookUrl(requestUrl: string): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? ''
  if (base) return `${base}/api/twilio/inbound-sms`
  return requestUrl
}
