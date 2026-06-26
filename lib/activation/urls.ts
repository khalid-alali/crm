import { crmPublicBaseUrl } from '@/lib/expert-assist/slack'
import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'

const TOOLBOX_SIGNUP_BASE = 'https://app.fixlane.com/sign-up'

/** Consumer Toolbox sign-up URL — casePartner only, never consult_short_code. */
export function toolboxDiagnoseUrl(
  casePartner: string,
  opts?: { utmSource?: string; utmMedium?: string },
): string {
  const params = new URLSearchParams({ casePartner })
  params.set('utm_source', opts?.utmSource ?? 'shop')
  if (opts?.utmMedium) params.set('utm_medium', opts.utmMedium)
  return `${TOOLBOX_SIGNUP_BASE}?${params.toString()}`
}

export function counterCardDiagnoseUrl(casePartner: string): string {
  return toolboxDiagnoseUrl(casePartner, { utmSource: 'qr', utmMedium: 'counter_card' })
}

/** Tracked forward CTA (Resend click webhook in PR5). */
export function ownerForwardCtaUrl(locationId: string): string {
  return `${crmPublicBaseUrl()}/api/expert-assist/activation/forward-click?locationId=${encodeURIComponent(locationId)}`
}

/** Counter-card PDF download (auth route in PR5). */
export function counterCardDownloadUrl(locationId: string): string {
  return `${crmPublicBaseUrl()}/api/expert-assist/counter-card?locationId=${encodeURIComponent(locationId)}`
}

export function expertAssistToolkitUrl(locationId: string): string {
  const base = expertAssistSurfacesBaseUrl().replace(/\/$/, '')
  return `${base}/s/${encodeURIComponent(locationId)}`
}

export function expertAssistTollFreeNumber(): string {
  return (
    process.env.EXPERT_ASSIST_TOLL_FREE_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    'your Expert Assist number'
  )
}
