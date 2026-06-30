'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmailBodyEditor, type EmailBodyEditorHandle } from '@/components/EmailBodyEditor'
import RecipientPicker from '@/components/email/RecipientPicker'
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  type EmailTemplateCategory,
} from '@/lib/email-template-categories'
import { EMAIL_MERGE_PLACEHOLDER_TOKENS } from '@/lib/email-template-placeholder-tokens'

function formFingerprint(
  name: string,
  category: string,
  description: string,
  subject: string,
  bodyHtml: string,
  defaultRecipients: string[],
  defaultCcRecipients: string[],
): string {
  return JSON.stringify({
    name: name.trim(),
    category,
    description: description.trim(),
    subject: subject.trim(),
    bodyHtml,
    defaultRecipients,
    defaultCcRecipients,
  })
}

export type EmailTemplateRow = {
  id: string
  name: string
  category: string
  description: string | null
  subject: string
  body_html: string
  default_recipients: string[] | null
  default_cc_recipients: string[] | null
  created_by: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

type Props = { mode: 'create' | 'edit'; templateId?: string }

const DISCARD_MESSAGE = 'You have unsaved changes. Discard them and leave this page?'

export default function EmailTemplateForm({ mode, templateId }: Props) {
  const router = useRouter()
  const editorRef = useRef<EmailBodyEditorHandle>(null)
  const subjectInputRef = useRef<HTMLInputElement>(null)
  /** Last field the user edited; sidebar clicks blur inputs, so we cannot rely on focus alone. */
  const lastInsertFieldRef = useRef<'subject' | 'body'>('body')
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<EmailTemplateCategory>('general')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('<p></p>')
  const [defaultRecipients, setDefaultRecipients] = useState<string[]>([])
  const [defaultCcRecipients, setDefaultCcRecipients] = useState<string[]>([])
  const [error, setError] = useState('')
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  const baselineSyncedRef = useRef(false)
  const [saveFlashVisible, setSaveFlashVisible] = useState(false)
  const [saveFlashFading, setSaveFlashFading] = useState(false)
  const saveFlashTimersRef = useRef<{ show?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout> }>(
    {},
  )

  const fingerprint = useMemo(
    () =>
      formFingerprint(
        name,
        category,
        description,
        subject,
        bodyHtml,
        defaultRecipients,
        defaultCcRecipients,
      ),
    [name, category, description, subject, bodyHtml, defaultRecipients, defaultCcRecipients],
  )
  const isDirty = savedFingerprint !== null && fingerprint !== savedFingerprint

  const load = useCallback(async () => {
    if (mode !== 'edit' || !templateId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/templates/${templateId}?includeArchived=1`)
      const data = (await res.json().catch(() => ({}))) as EmailTemplateRow & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setName(data.name)
      setCategory((data.category as EmailTemplateCategory) ?? 'general')
      setDescription(data.description ?? '')
      setSubject(data.subject)
      setBodyHtml(data.body_html || '<p></p>')
      setDefaultRecipients(data.default_recipients ?? [])
      setDefaultCcRecipients(data.default_cc_recipients ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [mode, templateId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading) {
      baselineSyncedRef.current = false
      return
    }
    if (baselineSyncedRef.current) return
    baselineSyncedRef.current = true
    setSavedFingerprint(
      formFingerprint(
        name,
        category,
        description,
        subject,
        bodyHtml,
        defaultRecipients,
        defaultCcRecipients,
      ),
    )
  }, [loading, name, category, description, subject, bodyHtml, defaultRecipients, defaultCcRecipients])

  const clearSaveFlashTimers = useCallback(() => {
    const t = saveFlashTimersRef.current
    if (t.show) clearTimeout(t.show)
    if (t.hide) clearTimeout(t.hide)
    saveFlashTimersRef.current = {}
  }, [])

  useEffect(() => {
    return () => clearSaveFlashTimers()
  }, [clearSaveFlashTimers])

  useEffect(() => {
    if (isDirty && saveFlashVisible) {
      clearSaveFlashTimers()
      setSaveFlashVisible(false)
      setSaveFlashFading(false)
    }
  }, [isDirty, saveFlashVisible, clearSaveFlashTimers])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  function confirmDiscard(): boolean {
    if (!isDirty) return true
    return window.confirm(DISCARD_MESSAGE)
  }

  function navigateToList() {
    router.push('/settings/email-templates')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            category,
            description: description.trim() || null,
            subject,
            body_html: bodyHtml,
            default_recipients: defaultRecipients.length > 0 ? defaultRecipients : null,
            default_cc_recipients: defaultCcRecipients.length > 0 ? defaultCcRecipients : null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
        router.push(`/settings/email-templates/${(data as EmailTemplateRow).id}`)
        router.refresh()
        return
      }
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          description: description.trim() || null,
          subject,
          body_html: bodyHtml,
          default_recipients: defaultRecipients.length > 0 ? defaultRecipients : null,
          default_cc_recipients: defaultCcRecipients.length > 0 ? defaultCcRecipients : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
      setSavedFingerprint(
        formFingerprint(
          name,
          category,
          description,
          subject,
          bodyHtml,
          defaultRecipients,
          defaultCcRecipients,
        ),
      )
      clearSaveFlashTimers()
      setSaveFlashFading(false)
      setSaveFlashVisible(true)
      saveFlashTimersRef.current.show = setTimeout(() => {
        setSaveFlashFading(true)
      }, 3000)
      saveFlashTimersRef.current.hide = setTimeout(() => {
        setSaveFlashVisible(false)
        setSaveFlashFading(false)
        clearSaveFlashTimers()
      }, 3200)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (mode !== 'edit' || !templateId) return
    if (!confirmDiscard()) return
    const archiveMsg = 'Archive this template? It will be hidden from the picker.'
    if (!window.confirm(archiveMsg)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Archive failed')
      }
      router.push('/settings/email-templates')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Archive failed')
    } finally {
      setSaving(false)
    }
  }

  function insertIntoSubjectAtCursor(token: string) {
    const el = subjectInputRef.current
    if (!el) {
      setSubject(prev => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}` : '') + token)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + token + el.value.slice(end)
    setSubject(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  function appendTokenToSubject(token: string) {
    setSubject(prev => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}` : '') + token)
    requestAnimationFrame(() => subjectInputRef.current?.focus())
  }

  function insertToken(token: string) {
    const subjectEl = subjectInputRef.current
    const subjectFocused = Boolean(subjectEl && document.activeElement === subjectEl)
    if (subjectFocused) {
      insertIntoSubjectAtCursor(token)
      return
    }
    if (lastInsertFieldRef.current === 'subject') {
      appendTokenToSubject(token)
      return
    }
    editorRef.current?.insertText(token)
  }

  if (loading) {
    return (
      <div className="p-8 text-sm text-onix-600">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-4 text-xs text-onix-500">
        <Link
          href="/settings/email-templates"
          className="hover:text-brand-700"
          onClick={e => {
            if (!confirmDiscard()) e.preventDefault()
          }}
        >
          Email templates
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-onix-800">{mode === 'create' ? 'New template' : 'Edit template'}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-onix-950">{name || 'New template'}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={saving}
              className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
            >
              Archive
            </button>
          )}
          {isDirty && !saving && !saveFlashVisible && (
            <span
              className="text-xs leading-5"
              style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}
              aria-live="polite"
            >
              Unsaved changes
            </span>
          )}
          {saveFlashVisible && !isDirty && (
            <span
              className={`text-xs leading-5 transition-opacity duration-200 ${
                saveFlashFading ? 'opacity-0' : 'opacity-100'
              }`}
              style={{ color: 'var(--color-text-success)', fontSize: 12 }}
              aria-live="polite"
            >
              Saved ✓
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirmDiscard()) return
              navigateToList()
            }}
            className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-700 hover:bg-arctic-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim() || !subject.trim()}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-arctic-200 disabled:text-onix-600 disabled:shadow-none"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-onix-600">Template name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-onix-600">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as EmailTemplateCategory)}
                className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {EMAIL_TEMPLATE_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {EMAIL_TEMPLATE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-onix-600">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short summary for the template list"
                className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-onix-600">Subject</label>
            <input
              ref={subjectInputRef}
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              onFocus={() => {
                lastInsertFieldRef.current = 'subject'
              }}
              className="w-full rounded-lg border border-arctic-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <RecipientPicker
              label="To"
              shopName="Template defaults"
              accountName={null}
              value={defaultRecipients}
              onChange={setDefaultRecipients}
              contacts={[]}
              excludeEmails={defaultCcRecipients}
              placeholder="Add default recipient"
            />
            <RecipientPicker
              label="Cc"
              shopName="Template defaults"
              accountName={null}
              value={defaultCcRecipients}
              onChange={setDefaultCcRecipients}
              contacts={[]}
              excludeEmails={defaultRecipients}
              placeholder="Add default Cc"
            />
          </div>
          <div
            onFocusCapture={() => {
              lastInsertFieldRef.current = 'body'
            }}
          >
            <label className="mb-1 block text-xs font-medium text-onix-600">Body</label>
            <EmailBodyEditor ref={editorRef} value={bodyHtml} onChange={setBodyHtml} compact={false} />
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-6 lg:sticky lg:top-6 lg:self-start lg:w-64">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-onix-500">Insert placeholder</h2>
            <p className="mt-1 text-xs text-onix-500">
              Inserts into the subject or body field you last used, at the cursor when possible.
            </p>
            <p className="mt-3 text-xs font-medium text-violet-700">Merge fields</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMAIL_MERGE_PLACEHOLDER_TOKENS.map(token => (
                <button
                  key={token}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertToken(token)}
                  className="rounded-full bg-violet-50 px-2 py-1 font-mono text-[10px] text-violet-900 hover:bg-violet-100"
                >
                  {token}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-snug text-onix-500">
              For <span className="font-mono text-onix-700">{'{{capabilities_link}}'}</span>,{' '}
              <span className="font-mono text-onix-700">{'{{expert_assist_link}}'}</span>,{' '}
              <span className="font-mono text-onix-700">{'{{enrollment_portal_link}}'}</span>, or{' '}
              <span className="font-mono text-onix-700">{'{{routable_bank_link}}'}</span>, select link text in the
              body, click the toolbar <strong>Link</strong> button, then choose the placeholder in that dialog.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
