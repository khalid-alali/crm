import { createHmac, timingSafeEqual } from 'crypto'
import { expertAssistPublicBaseUrl } from '@/lib/expert-assist/constants'
import { createConsultMediaSignedUrls } from '@/lib/expert-assist/storage'
import { getTwilioWebhookSigningSecret } from '@/lib/expert-assist/twilio-client'

function mediaSigningSecret(): string {
  const secret = getTwilioWebhookSigningSecret() ?? process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) throw new Error('Set TWILIO_WEBHOOK_AUTH_TOKEN or NEXTAUTH_SECRET for MMS media URLs')
  return secret
}

export function signConsultMediaPath(path: string, exp: number): string {
  return createHmac('sha256', mediaSigningSecret()).update(`${path}:${exp}`).digest('hex')
}

export function verifyConsultMediaPath(path: string, exp: number, sig: string): boolean {
  if (!path.startsWith('cases/') || path.includes('..')) return false
  if (exp < Math.floor(Date.now() / 1000)) return false
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false
  const expected = signConsultMediaPath(path, exp)
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/** URLs Twilio can GET when sending outbound MMS. Prefer app proxy when public base is configured. */
export async function resolveTwilioMmsMediaUrls(paths: string[], ttlSec: number): Promise<string[]> {
  const base = expertAssistPublicBaseUrl()
  if (base) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec
    return paths.map(p => {
      const sig = signConsultMediaPath(p, exp)
      const q = new URLSearchParams({ path: p, exp: String(exp), sig })
      return `${base}/api/twilio/mms-media?${q.toString()}`
    })
  }

  const signed = await createConsultMediaSignedUrls(paths, ttlSec)
  const urls = paths.map(p => signed.get(p)).filter((u): u is string => Boolean(u))
  if (urls.length !== paths.length) {
    throw new Error(
      'Failed to sign MMS media. Set TWILIO_WEBHOOK_BASE_URL to a public HTTPS URL for outbound photos.'
    )
  }
  return urls
}
