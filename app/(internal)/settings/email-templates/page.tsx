'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { EmailTemplateRow } from '@/components/email-templates/EmailTemplateForm'
import { EMAIL_TEMPLATE_CATEGORIES, EMAIL_TEMPLATE_CATEGORY_LABELS } from '@/lib/email-template-categories'
import { categoryLabel, categoryPillClass, formatRelativeTime, previewPlainFromHtml } from '@/lib/email-template-ui'

export default function EmailTemplatesListPage() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/templates?includeArchived=1')
        const data = (await res.json()) as { templates?: EmailTemplateRow[]; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        if (!cancelled) setTemplates(data.templates ?? [])
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    let rows = templates.filter(t => !t.archived)
    if (categoryFilter) rows = rows.filter(t => t.category === categoryFilter)
    return rows
  }, [templates, categoryFilter])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-2 text-xs text-onix-500">
        <span className="text-onix-700">Settings</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-onix-950">Email templates</h1>
          <p className="mt-1 text-sm text-onix-600">
            Shared across the team. Used when sending emails from a shop&apos;s detail page.
          </p>
        </div>
        <Link
          href="/settings/email-templates/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          + New template
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="min-w-[14rem] max-w-full rounded-lg border border-arctic-300 py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {EMAIL_TEMPLATE_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {EMAIL_TEMPLATE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-onix-600">Loading…</p>}

      {!loading && visible.length === 0 && (
        <p className="text-sm text-onix-600">No templates yet. Create one to get started.</p>
      )}

      <ul className="divide-y divide-arctic-200 rounded-lg border border-arctic-200 bg-white">
        {visible.map(t => {
          const desc =
            (t.description && t.description.trim()) || previewPlainFromHtml(t.body_html, 120)
          const by = t.created_by ?? 'System'
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-onix-950">{t.name}</p>
                <p className="mt-0.5 text-xs text-onix-500">{desc}</p>
                <p className="mt-2 text-xs text-onix-400">
                  {by} · {formatRelativeTime(t.updated_at)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryPillClass(t.category)}`}
              >
                {categoryLabel(t.category)}
              </span>
              <Link
                href={`/settings/email-templates/${t.id}`}
                className="shrink-0 rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50"
              >
                Edit
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
