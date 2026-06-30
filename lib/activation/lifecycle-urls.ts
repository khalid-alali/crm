import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'

/** Shop signup / handoff toolkit on Expert Assist surfaces (`/s/<locationId>`). */
export function expertAssistShopSetupUrl(locationId: string): string {
  const base = expertAssistSurfacesBaseUrl().replace(/\/$/, '')
  return `${base}/s/${encodeURIComponent(locationId.trim())}`
}

/** Billing card update — surfaces shop portal (same host as setup). */
export function expertAssistUpdateCardUrl(locationId: string): string {
  return expertAssistShopSetupUrl(locationId)
}
