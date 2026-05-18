import type { NextRequest } from 'next/server'

import { EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID } from '@/lib/email-template-ids'

export type ExpertAssistIntakeLinkMode = 'preview' | 'real'

/**
 * Public base URL for the static Expert Assist intake app (no trailing slash).
 * e.g. https://expert-assist.fixlane.app
 */
export function expertAssistIntakePublicUrl(req?: NextRequest): string {
  const fromEnv = process.env.EXPERT_ASSIST_INTAKE_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (!req) return ''
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  return ''
}

/** Build intake form URL: `?shop=<locationId>&name=<encoded shop name>`. */
export function buildExpertAssistIntakeHref(
  baseUrl: string,
  mode: ExpertAssistIntakeLinkMode,
  locationId?: string,
  shopName?: string,
): string {
  const base = baseUrl.replace(/\/$/, '')
  if (mode === 'preview') {
    return `${base}/?shop=${encodeURIComponent(EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID)}&name=${encodeURIComponent('Shop name preview')}`
  }
  const id = locationId?.trim() || EXPERT_ASSIST_LINK_PREVIEW_SHOP_ID
  const name = shopName?.trim() || 'Your shop'
  return `${base}/?shop=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
}
