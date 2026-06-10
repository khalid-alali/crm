import { laborRatePublicBaseUrl } from '@/lib/labor-rate-approval/config'
import { formatRateDollars } from '@/lib/labor-rate-approval/sla'

export type LaborRateEmailContext = {
  shopName: string
  city: string | null
  state: string | null
  chargeRate: number
  decisionToken: string
  submittedAt: string
  isReminder?: boolean
  isEscalation?: boolean
  benchmarkAverageRate?: number | null
  benchmarkShopsSurveyed?: number | null
}

function locationLine(city: string | null, state: string | null): string {
  const parts = [city, state].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : ''
}

function formatBenchmarkRate(rate: number): string {
  return `$${Math.round(rate)}`
}

export function buildBenchmarkLine(ctx: LaborRateEmailContext): string | null {
  const count = ctx.benchmarkShopsSurveyed
  const rate = ctx.benchmarkAverageRate
  if (count == null || rate == null || count <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return null
  }
  const shopWord = count === 1 ? 'shop' : 'shops'
  return `Regional average across ${count} nearby surveyed ${shopWord}: ${formatBenchmarkRate(rate)}/hr.`
}

export function buildLaborRateEmailPreview(ctx: LaborRateEmailContext): {
  subject: string
  body: string
  bodyHtml: string
} {
  return {
    subject: buildSubject(ctx),
    body: buildBodyText(ctx),
    bodyHtml: buildBodyHtml(ctx),
  }
}

export function buildSubject(ctx: LaborRateEmailContext): string {
  return `Labor rate approval · ${ctx.shopName}`
}

export function buildBodyText(ctx: LaborRateEmailContext): string {
  const base = laborRatePublicBaseUrl()
  const approveUrl = `${base}/approve/${ctx.decisionToken}`
  const changesUrl = `${base}/request-changes/${ctx.decisionToken}`
  const loc = locationLine(ctx.city, ctx.state)
  const rate = formatRateDollars(ctx.chargeRate)

  const benchmarkLine = buildBenchmarkLine(ctx)

  const lines = [
    `Shop: ${ctx.shopName}${loc ? ` (${loc})` : ''}`,
    '',
    `Proposed labor rate: ${rate} / hr`,
    ...(benchmarkLine ? ['', benchmarkLine] : []),
    '',
    'Please review and choose one:',
    `Approve: ${approveUrl}`,
    `Request changes: ${changesUrl}`,
    '',
    '',
  ]

  if (ctx.isEscalation) {
    lines.unshift('This approval has been escalated and is awaiting a decision.')
  } else if (ctx.isReminder) {
    lines.unshift('Reminder: this labor rate approval is still awaiting a decision.')
  }

  return lines.join('\n')
}

export function buildBodyHtml(ctx: LaborRateEmailContext): string {
  const base = laborRatePublicBaseUrl()
  const approveUrl = `${base}/approve/${ctx.decisionToken}`
  const changesUrl = `${base}/request-changes/${ctx.decisionToken}`
  const loc = locationLine(ctx.city, ctx.state)
  const rate = formatRateDollars(ctx.chargeRate)
  const intro = ctx.isEscalation
    ? '<p><strong>This approval has been escalated and is awaiting a decision.</strong></p>'
    : ctx.isReminder
      ? '<p><strong>Reminder:</strong> this labor rate approval is still awaiting a decision.</p>'
      : ''

  const benchmarkLine = buildBenchmarkLine(ctx)
  const benchmarkHtml = benchmarkLine
    ? `<p>${escapeHtml(benchmarkLine)}</p>`
    : ''

  return `${intro}<p>Shop: <strong>${escapeHtml(ctx.shopName)}</strong>${loc ? ` (${escapeHtml(loc)})` : ''}</p>
<p>Proposed <strong>labor rate</strong>: ${escapeHtml(rate)} / hr</p>
${benchmarkHtml}<p>Please review and choose one:</p>
<p><a href="${escapeHtml(approveUrl)}">Approve</a></p>
<p><a href="${escapeHtml(changesUrl)}">Request changes</a></p>
<p style="color:#666;font-size:13px;"</p>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
