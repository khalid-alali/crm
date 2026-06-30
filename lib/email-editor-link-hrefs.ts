import {
  CAPABILITIES_LINK_PREVIEW_TOKEN,
  ROUTABLE_BANK_LINK_PREVIEW_TOKEN,
} from '@/lib/email-template-ids'

/** Turn merge/link placeholders into absolute preview URLs so TipTap keeps anchors and in-app clicks do not resolve under /shops/. */
export function normalizeAutoLinkPlaceholderForEditor(href: string, origin: string): string {
  const trimmed = href.trim()
  const base = origin.replace(/\/$/, '')

  if (trimmed === '{{capabilities_link}}' || trimmed === '{{portal_url}}') {
    return `${base}/portal/${CAPABILITIES_LINK_PREVIEW_TOKEN}`
  }
  if (
    trimmed === '{{routable_bank_link}}' ||
    trimmed === '{{bank_link}}' ||
    trimmed === '{{connect_bank_account_link}}'
  ) {
    return `${base}/portal/${ROUTABLE_BANK_LINK_PREVIEW_TOKEN}`
  }

  return trimmed
}
