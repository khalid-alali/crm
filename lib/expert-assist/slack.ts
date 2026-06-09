import { formatConsultCaseId } from '@/lib/expert-assist/queue-display'

export type ExpertAssistSlackNotify =
  | { type: 'open'; caseId: string; shopName: string; source?: string }
  | { type: 'approved'; caseId: string; shopName: string }
  | { type: 'awaiting_approval'; caseId: string; shopName: string }
  | { type: 'idle_nudge'; caseId: string; shopName?: string }

type SlackTextObject = { type: 'plain_text' | 'mrkdwn'; text: string; emoji?: boolean }
type SlackBlock =
  | { type: 'header'; text: SlackTextObject }
  | { type: 'section'; text?: SlackTextObject; fields?: SlackTextObject[] }
  | {
      type: 'actions'
      elements: Array<{
        type: 'button'
        text: SlackTextObject
        url: string
        style?: 'primary' | 'danger'
      }>
    }

const SOURCE_LABELS: Record<string, string> = {
  surfaces_web: 'Web',
  web_intake: 'Web intake',
  sms: 'SMS',
}

/** Public CRM base for consult deep links (Slack, email). */
export function crmPublicBaseUrl(): string {
  return (
    process.env.CRM_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') ||
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, '') ||
    'https://crm.fixlane.app'
  )
}

export function crmConsultUrl(caseId: string): string {
  return `${crmPublicBaseUrl()}/consults/${caseId}`
}

export function formatConsultSource(source?: string): string | undefined {
  if (!source?.trim()) return undefined
  const key = source.trim()
  return SOURCE_LABELS[key] ?? key.replace(/_/g, ' ')
}

function notifyTitle(notify: ExpertAssistSlackNotify): string {
  switch (notify.type) {
    case 'open':
      return 'New open case'
    case 'approved':
      return 'Case approved'
    case 'awaiting_approval':
      return 'Awaiting expert approval'
    case 'idle_nudge':
      return 'Idle case nudge'
  }
}

function notifyAccent(notify: ExpertAssistSlackNotify): string {
  switch (notify.type) {
    case 'open':
    case 'approved':
      return '#1D9E75'
    case 'awaiting_approval':
    case 'idle_nudge':
      return '#EF9F27'
  }
}

function notifyFallbackText(notify: ExpertAssistSlackNotify, crmUrl: string, displayId: string): string {
  const shop = notify.shopName?.trim() || 'Unknown shop'
  switch (notify.type) {
    case 'open': {
      const source = formatConsultSource(notify.source)
      return source ?
          `Expert Assist: ${displayId} opened (${source}) — ${shop}. ${crmUrl}`
        : `Expert Assist: ${displayId} opened — ${shop}. ${crmUrl}`
    }
    case 'approved':
      return `Expert Assist: ${displayId} approved and open — ${shop}. ${crmUrl}`
    case 'awaiting_approval':
      return `Expert Assist: ${displayId} awaiting expert approval — ${shop}. ${crmUrl}`
    case 'idle_nudge':
      return `Expert Assist: ${displayId} idle >10 min (shop inbound). ${crmUrl}`
  }
}

export function buildExpertAssistSlackMessage(notify: ExpertAssistSlackNotify): {
  text: string
  attachments: Array<{ color: string; blocks: SlackBlock[] }>
} {
  const crmUrl = crmConsultUrl(notify.caseId)
  const displayId = formatConsultCaseId(notify.caseId)
  const shopName = notify.shopName?.trim() || 'Unknown shop'
  const source = notify.type === 'open' ? formatConsultSource(notify.source) : undefined

  const fields: SlackTextObject[] = [
    { type: 'mrkdwn', text: `*Shop*\n${shopName}` },
    { type: 'mrkdwn', text: `*Case*\n${displayId}` },
  ]
  if (source) {
    fields.push({ type: 'mrkdwn', text: `*Source*\n${source}` })
  }
  if (notify.type === 'idle_nudge') {
    fields.push({ type: 'mrkdwn', text: '*Status*\nShop replied >10 min ago' })
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Expert Assist — ${notifyTitle(notify)}`, emoji: true },
    },
    { type: 'section', fields },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open in CRM', emoji: true },
          url: crmUrl,
          style: 'primary',
        },
      ],
    },
  ]

  return {
    text: notifyFallbackText(notify, crmUrl, displayId),
    attachments: [{ color: notifyAccent(notify), blocks }],
  }
}

export async function notifyExpertAssistSlack(notify: ExpertAssistSlackNotify): Promise<void> {
  const url = process.env.EXPERT_ASSIST_SLACK_WEBHOOK_URL?.trim()
  if (!url) return
  const payload = buildExpertAssistSlackMessage(notify)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: payload.text,
        attachments: payload.attachments,
      }),
    })
  } catch (e) {
    console.error('notifyExpertAssistSlack', e)
  }
}

/** @deprecated Prefer notifyExpertAssistSlack for structured notifications. */
export async function postExpertAssistSlack(text: string): Promise<void> {
  const url = process.env.EXPERT_ASSIST_SLACK_WEBHOOK_URL?.trim()
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (e) {
    console.error('postExpertAssistSlack', e)
  }
}
