'use client'

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Link from 'next/link'
import { Check, FileText, Mail, Pencil, Phone, X } from 'lucide-react'
import { formatBulkPipelineStatusLogBody } from '@/lib/location-status-labels'
import {
  activityEmailNeedsRecipientDrawer,
  activityPreviewPlain,
  bodyNeedsDrawer,
  emailActivityCompactRecipientSummary,
  formatRecipientDrawerSegment,
  parseActivityRecipients,
  stripEmailActivityFooter,
} from '@/lib/activity-feed-preview'

export type ActivityFeedEntry = {
  id: string
  type: string
  subject?: string | null
  body?: string | null
  to_email?: string | null
  recipients?: unknown
  sent_by?: string | null
  created_at: string
  location_id?: string
  locations?: { name: string } | null
}

function calendarDaysAgo(iso: string): number {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return NaN
  const now = new Date()
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(now) - start(dt)) / 86400000)
}

function formatActivityWhen(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const dayDiff = calendarDaysAgo(iso)
  const timeStr = dt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (dayDiff === 0) return `Today, ${timeStr}`
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff >= 2 && dayDiff < 7) return `${dayDiff} days ago`
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatActivityDate(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatActivityTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function eventTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'email':
      return 'Email sent'
    case 'note':
      return 'Note'
    case 'status_change':
      return 'Status changed'
    case 'contract':
      return 'Contract'
    case 'address_update':
      return 'Address updated'
    case 'shop_created':
      return 'Shop created'
    case 'call':
      return 'Call'
    default:
      return (type ?? 'activity').replace(/_/g, ' ')
  }
}

function actorDisplay(entry: ActivityFeedEntry): string {
  const s = typeof entry.sent_by === 'string' ? entry.sent_by.trim() : ''
  return s || '—'
}

function nonEmailTitlePreview(entry: ActivityFeedEntry, formattedBody: string): { title: string; preview: string } {
  const sub = entry.subject?.trim()
  if (sub) {
    return {
      title: sub,
      preview: activityPreviewPlain(entry.body ?? '', 80),
    }
  }
  const lines = formattedBody
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { title: '', preview: '' }
  if (lines.length === 1) {
    return { title: lines[0], preview: '' }
  }
  return {
    title: lines[0],
    preview: activityPreviewPlain(lines.slice(1).join(' '), 80),
  }
}

function iconTileForType(type: string | undefined): { wrap: string; Icon: typeof Mail } {
  switch (type) {
    case 'email':
      return { wrap: 'bg-sky-100 text-sky-700', Icon: Mail }
    case 'note':
      return { wrap: 'bg-amber-50 text-amber-700', Icon: Pencil }
    case 'status_change':
      return { wrap: 'bg-emerald-50 text-emerald-700', Icon: Check }
    case 'contract':
      return { wrap: 'bg-violet-50 text-violet-700', Icon: FileText }
    case 'call':
      return { wrap: 'bg-teal-50 text-teal-700', Icon: Phone }
    default:
      return { wrap: 'bg-arctic-100 text-onix-600', Icon: FileText }
  }
}

function drawerBodyHtml(entry: ActivityFeedEntry): string {
  const raw = typeof entry.body === 'string' ? entry.body : ''
  return formatBulkPipelineStatusLogBody(stripEmailActivityFooter(raw))
}

function expandableRowProps(
  expandable: boolean,
  onExpand: () => void,
  label: string,
): {
  role?: 'button'
  tabIndex?: number
  onClick?: () => void
  onKeyDown?: (e: ReactKeyboardEvent) => void
  className?: string
  'aria-label'?: string
} {
  if (!expandable) return {}
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onExpand,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onExpand()
      }
    },
    className: 'cursor-pointer hover:bg-arctic-50',
    'aria-label': label,
  }
}

function mailtoReplyHref(entry: ActivityFeedEntry): string | null {
  if (entry.type !== 'email') return null
  const to = typeof entry.to_email === 'string' ? entry.to_email.trim() : ''
  if (!to) return null
  const sub = typeof entry.subject === 'string' ? entry.subject.trim() : ''
  const q = new URLSearchParams()
  if (sub) q.set('subject', `Re: ${sub}`)
  const qs = q.toString()
  return qs ? `mailto:${to}?${qs}` : `mailto:${to}`
}

type Props = {
  entries: ActivityFeedEntry[]
  showLocationLink?: boolean
  /** Optional lowercased-email → display name for richer activity summaries (best-effort). */
  recipientDisplayNames?: Record<string, string>
}

export default function ActivityFeed({
  entries,
  showLocationLink = false,
  recipientDisplayNames,
}: Props) {
  const [drawerEntry, setDrawerEntry] = useState<ActivityFeedEntry | null>(null)

  useEffect(() => {
    if (!drawerEntry) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerEntry(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerEntry])

  if (entries.length === 0) {
    return <p className="text-sm text-onix-400">No activity yet.</p>
  }

  return (
    <>
      <div className="space-y-1.5">
        {entries.map(entry => {
          const when = formatActivityWhen(entry.created_at)
          const shopHref =
            showLocationLink && entry.location_id && entry.locations?.name
              ? `/shops/${entry.location_id}`
              : null
          const actor = actorDisplay(entry)
          const eventLabel = eventTypeLabel(entry.type)
          const { wrap: iconWrap, Icon } = iconTileForType(entry.type)
          const rawBody = typeof entry.body === 'string' ? entry.body : ''

          if (entry.type === 'email') {
            const subject = typeof entry.subject === 'string' ? entry.subject.trim() : ''
            const preview = activityPreviewPlain(rawBody, 80, { stripGreeting: true })
            const expandEmail =
              bodyNeedsDrawer(rawBody, 80) || activityEmailNeedsRecipientDrawer(entry.recipients)
            const recipientSummary = emailActivityCompactRecipientSummary(
              entry.recipients,
              recipientDisplayNames,
            )

            const expandProps = expandableRowProps(
              expandEmail,
              () => setDrawerEntry(entry),
              `View ${eventLabel.toLowerCase()} details`,
            )

            return (
              <div
                key={entry.id}
                className={`flex gap-2.5 rounded-lg border border-arctic-200 bg-white p-2.5 shadow-sm ${expandProps.className ?? ''}`}
                role={expandProps.role}
                tabIndex={expandProps.tabIndex}
                onClick={expandProps.onClick}
                onKeyDown={expandProps.onKeyDown}
                aria-label={expandProps['aria-label']}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconWrap}`}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5 stroke-[2]" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="line-clamp-1 text-[11px] font-semibold tracking-wide text-onix-500">
                    <span className="uppercase">{eventLabel}</span>
                    <span className="text-onix-400"> · </span>
                    <span className="font-medium normal-case tracking-normal text-onix-600">{actor}</span>
                    {shopHref ? (
                      <>
                        <span className="text-onix-400"> · </span>
                        <Link
                          href={shopHref}
                          onClick={e => e.stopPropagation()}
                          className="font-medium normal-case tracking-normal text-brand-600 hover:underline"
                        >
                          {entry.locations!.name}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="line-clamp-1 text-sm font-medium leading-snug text-onix-900">
                    {subject || '—'}
                  </p>
                  {recipientSummary ? (
                    <p className="line-clamp-2 text-[12px] leading-snug text-onix-500">{recipientSummary}</p>
                  ) : null}
                  {preview ? (
                    <p className="line-clamp-1 text-[13px] leading-snug text-onix-500">{preview}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end text-right">
                  <time dateTime={entry.created_at} className="text-[11px] tabular-nums leading-tight text-onix-400">
                    {when}
                  </time>
                </div>
              </div>
            )
          }

          const formattedBody = entry.body ? formatBulkPipelineStatusLogBody(entry.body) : ''
          const { title, preview } = nonEmailTitlePreview(entry, formattedBody)
          const showExpand =
            entry.type === 'call' ? true : bodyNeedsDrawer(entry.body ?? '', 80)

          const expandProps = expandableRowProps(
            showExpand,
            () => setDrawerEntry(entry),
            `View ${eventLabel.toLowerCase()} details`,
          )

          return (
            <div
              key={entry.id}
              className={`flex gap-2.5 rounded-lg border border-arctic-200 bg-white p-2.5 shadow-sm ${expandProps.className ?? ''}`}
              role={expandProps.role}
              tabIndex={expandProps.tabIndex}
              onClick={expandProps.onClick}
              onKeyDown={expandProps.onKeyDown}
              aria-label={expandProps['aria-label']}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconWrap}`}
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="line-clamp-1 text-[11px] font-semibold tracking-wide text-onix-500">
                  <span className="uppercase">{eventLabel}</span>
                  <span className="text-onix-400"> · </span>
                  <span className="font-medium normal-case tracking-normal text-onix-600">{actor}</span>
                  {shopHref ? (
                    <>
                      <span className="text-onix-400"> · </span>
                      <Link
                        href={shopHref}
                        onClick={e => e.stopPropagation()}
                        className="font-medium normal-case tracking-normal text-brand-600 hover:underline"
                      >
                        {entry.locations!.name}
                      </Link>
                    </>
                  ) : null}
                </p>
                {title ? (
                  <p className="line-clamp-1 text-sm font-medium leading-snug text-onix-900">{title}</p>
                ) : null}
                {preview ? (
                  <p className="line-clamp-1 text-[13px] leading-snug text-onix-500">{preview}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end text-right">
                <time dateTime={entry.created_at} className="text-[11px] tabular-nums leading-tight text-onix-400">
                  {when}
                </time>
              </div>
            </div>
          )
        })}
      </div>

      {drawerEntry ? (
        <ActivityDrawer
          entry={drawerEntry}
          onClose={() => setDrawerEntry(null)}
          replyHref={mailtoReplyHref(drawerEntry)}
          recipientDisplayNames={recipientDisplayNames}
        />
      ) : null}
    </>
  )
}

function ActivityDrawer({
  entry,
  onClose,
  replyHref,
  recipientDisplayNames,
}: {
  entry: ActivityFeedEntry
  onClose: () => void
  replyHref: string | null
  recipientDisplayNames?: Record<string, string>
}) {
  const isEmail = entry.type === 'email'
  const isCall = entry.type === 'call'
  const formattedBody = entry.body ? formatBulkPipelineStatusLogBody(entry.body) : ''
  const firstLine =
    formattedBody
      .split('\n')
      .map(l => l.trim())
      .find(Boolean) ?? ''
  const headline =
    (typeof entry.subject === 'string' && entry.subject.trim()) ||
    (isEmail ? '—' : firstLine || eventTypeLabel(entry.type))
  const bodyText = drawerBodyHtml(entry)
  const toLegacy = typeof entry.to_email === 'string' ? entry.to_email.trim() : ''
  const from = typeof entry.sent_by === 'string' ? entry.sent_by.trim() : ''
  const parsedRecipients = isEmail ? parseActivityRecipients(entry.recipients) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-md flex-col border-l border-arctic-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-drawer-title"
      >
        <div className="flex items-start justify-between gap-2 border-b border-arctic-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-onix-500">
              <span className="uppercase">{isEmail ? 'Email' : eventTypeLabel(entry.type)}</span>
            </p>
            <h2 id="activity-drawer-title" className="mt-1 text-base font-semibold leading-snug text-onix-950">
              {headline}
            </h2>
            {isEmail ? (
              <div className="mt-2 space-y-0.5 text-xs text-onix-600">
                {parsedRecipients ? (
                  <>
                    {parsedRecipients.to.length > 0 ? (
                      <p className="break-words">
                        <span className="font-medium text-onix-700">To:</span>{' '}
                        {formatRecipientDrawerSegment(parsedRecipients.to, recipientDisplayNames)}
                      </p>
                    ) : null}
                    {parsedRecipients.cc.length > 0 ? (
                      <p className="break-words">
                        <span className="font-medium text-onix-700">Cc:</span>{' '}
                        {formatRecipientDrawerSegment(parsedRecipients.cc, recipientDisplayNames)}
                      </p>
                    ) : null}
                  </>
                ) : toLegacy ? (
                  <p>To: {toLegacy}</p>
                ) : null}
                {from ? <p>From: {from}</p> : null}
              </div>
            ) : isCall ? (
              <div className="mt-2 space-y-0.5 text-xs text-onix-600">
                <p>
                  <span className="font-medium text-onix-700">Date:</span>{' '}
                  <time dateTime={entry.created_at}>{formatActivityDate(entry.created_at)}</time>
                </p>
                <p>
                  <span className="font-medium text-onix-700">Time:</span>{' '}
                  <time dateTime={entry.created_at}>{formatActivityTime(entry.created_at)}</time>
                </p>
              </div>
            ) : from ? (
              <p className="mt-2 text-xs text-onix-600">By: {from}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1.5 text-onix-500 hover:bg-arctic-100 hover:text-onix-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-onix-800">{bodyText}</pre>
        </div>
        <div className="border-t border-arctic-200 px-4 py-3">
          {replyHref ? (
            <a
              href={replyHref}
              className="inline-flex rounded-lg border border-arctic-300 bg-white px-3 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
            >
              Reply
            </a>
          ) : isEmail ? (
            <p className="text-xs text-onix-500">Use the shop Email button to send from the CRM.</p>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
