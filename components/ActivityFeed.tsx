'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, FileText, Mail, Pencil, X } from 'lucide-react'
import { formatBulkPipelineStatusLogBody } from '@/lib/location-status-labels'
import { activityPreviewPlain, bodyNeedsDrawer, stripEmailActivityFooter } from '@/lib/activity-feed-preview'

export type ActivityFeedEntry = {
  id: string
  type: string
  subject?: string | null
  body?: string | null
  to_email?: string | null
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
    default:
      return { wrap: 'bg-arctic-100 text-onix-600', Icon: FileText }
  }
}

function drawerBodyHtml(entry: ActivityFeedEntry): string {
  const raw = typeof entry.body === 'string' ? entry.body : ''
  return formatBulkPipelineStatusLogBody(stripEmailActivityFooter(raw))
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
}

export default function ActivityFeed({ entries, showLocationLink = false }: Props) {
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
          const expand = bodyNeedsDrawer(rawBody, 80)

          if (entry.type === 'email') {
            const subject = typeof entry.subject === 'string' ? entry.subject.trim() : ''
            const preview = activityPreviewPlain(rawBody, 80, { stripGreeting: true })
            const replyHref = mailtoReplyHref(entry)

            return (
              <div
                key={entry.id}
                className="flex gap-2.5 rounded-lg border border-arctic-200 bg-white p-2.5 shadow-sm"
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
                  {preview ? (
                    <p className="line-clamp-1 text-[13px] leading-snug text-onix-500">{preview}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <time dateTime={entry.created_at} className="text-[11px] tabular-nums leading-tight text-onix-400">
                    {when}
                  </time>
                  {expand ? (
                    <button
                      type="button"
                      onClick={() => setDrawerEntry(entry)}
                      className="rounded border border-arctic-300 bg-white px-2 py-0.5 text-[11px] font-medium text-onix-800 hover:bg-arctic-50"
                    >
                      Expand
                    </button>
                  ) : null}
                </div>
              </div>
            )
          }

          const formattedBody = entry.body ? formatBulkPipelineStatusLogBody(entry.body) : ''
          const { title, preview } = nonEmailTitlePreview(entry, formattedBody)
          const showExpand = bodyNeedsDrawer(entry.body ?? '', 80)

          return (
            <div
              key={entry.id}
              className="flex gap-2.5 rounded-lg border border-arctic-200 bg-white p-2.5 shadow-sm"
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
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <time dateTime={entry.created_at} className="text-[11px] tabular-nums leading-tight text-onix-400">
                  {when}
                </time>
                {showExpand ? (
                  <button
                    type="button"
                    onClick={() => setDrawerEntry(entry)}
                    className="rounded border border-arctic-300 bg-white px-2 py-0.5 text-[11px] font-medium text-onix-800 hover:bg-arctic-50"
                  >
                    Expand
                  </button>
                ) : null}
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
        />
      ) : null}
    </>
  )
}

function ActivityDrawer({
  entry,
  onClose,
  replyHref,
}: {
  entry: ActivityFeedEntry
  onClose: () => void
  replyHref: string | null
}) {
  const isEmail = entry.type === 'email'
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
  const to = typeof entry.to_email === 'string' ? entry.to_email.trim() : ''
  const from = typeof entry.sent_by === 'string' ? entry.sent_by.trim() : ''

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
                {to ? <p>To: {to}</p> : null}
                {from ? <p>From: {from}</p> : null}
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
