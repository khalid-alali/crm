'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmailTemplateRow } from '@/components/email-templates/EmailTemplateForm'
import { EmailBodyEditor, type EmailBodyEditorHandle } from '@/components/EmailBodyEditor'
import { EMAIL_TEMPLATE_CATEGORIES, EMAIL_TEMPLATE_CATEGORY_LABELS } from '@/lib/email-template-categories'
import { EMAIL_MERGE_PLACEHOLDER_TOKENS } from '@/lib/email-template-placeholder-tokens'
import {
  emailContentReferencesCapabilitiesLink,
  emailContentReferencesExpertAssistLink,
  emailContentReferencesRoutableBankLink,
  replaceLegacyCapabilitiesPreviewUrls,
  replaceLegacyExpertAssistPreviewUrls,
} from '@/lib/email-template-placeholders'
import RecipientPicker, { type RecipientContact } from '@/components/email/RecipientPicker'

type Selection = 'unset' | 'blank' | { type: 'template'; id: string }

interface Props {
  locationId: string
  shopName: string
  contactName: string
  contactEmail: string
  senderName: string
  accountId?: string | null
  accountName?: string | null
  initialTemplateId?: string | null
  autoContinueFromInitialTemplate?: boolean
  /** When true, activity_log stores a footer so the feed shows this send came from shop detail. */
  fromShopDetail?: boolean
  onClose: () => void
  onSent?: () => void
}

function normalizeRecipientList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const emails = values
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
  return Array.from(new Set(emails))
}

function warningNeedsAdminLink(warning: string): boolean {
  return (
    warning.includes('{{vinfast_store_code}}') &&
    warning.includes('{{dealer_code}}') &&
    warning.includes('no Admin shop ID')
  )
}

export default function EmailModal({
  locationId,
  shopName,
  contactName,
  contactEmail,
  senderName: _senderName,
  accountId = null,
  accountName = null,
  initialTemplateId = null,
  autoContinueFromInitialTemplate = false,
  fromShopDetail,
  onClose,
  onSent,
}: Props) {
  const bodyEditorRef = useRef<EmailBodyEditorHandle>(null)
  const placeholderPanelRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<1 | 2>(1)
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Selection>('unset')
  const [emailTemplateId, setEmailTemplateId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('<p></p>')
  const primaryNorm = contactEmail.trim().toLowerCase()
  const [toList, setToList] = useState<string[]>(() =>
    contactEmail.trim() ? [contactEmail.trim().toLowerCase()] : [],
  )
  const [ccList, setCcList] = useState<string[]>([])
  const [ccOpen, setCcOpen] = useState(false)
  const [contacts, setContacts] = useState<RecipientContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [continueLoading, setContinueLoading] = useState(false)
  const [autoContinueAttempted, setAutoContinueAttempted] = useState(false)
  const [placeholderMenuOpen, setPlaceholderMenuOpen] = useState(false)
  const [placeholderTarget, setPlaceholderTarget] = useState<'body' | 'subject'>('body')
  const [renderWarnings, setRenderWarnings] = useState<string[]>([])

  const showCapabilitiesHint = useMemo(
    () => (step === 2 ? emailContentReferencesCapabilitiesLink(subject, body) : false),
    [step, subject, body],
  )

  const showExpertAssistHint = useMemo(
    () => (step === 2 ? emailContentReferencesExpertAssistLink(subject, body) : false),
    [step, subject, body],
  )

  const showRoutableBankLinkHint = useMemo(
    () => (step === 2 ? emailContentReferencesRoutableBankLink(subject, body) : false),
    [step, subject, body],
  )

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplatesError('')
    try {
      const res = await fetch('/api/templates')
      const data = (await res.json()) as { templates?: EmailTemplateRow[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not load templates')
      setTemplates(data.templates ?? [])
    } catch (e: unknown) {
      setTemplatesError(e instanceof Error ? e.message : 'Could not load templates')
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (!initialTemplateId) return
    if (templatesLoading) return
    if (selection !== 'unset') return
    const match = templates.find(t => t.id === initialTemplateId)
    if (!match) return
    setSelection({ type: 'template', id: initialTemplateId })
  }, [initialTemplateId, selection, templates, templatesLoading])

  const loadContacts = useCallback(async () => {
    if (!accountId) {
      setContacts([])
      return
    }
    setContactsLoading(true)
    setContactsError('')
    try {
      const res = await fetch(`/api/contacts?account_id=${encodeURIComponent(accountId)}`)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const err = typeof data === 'object' && data && 'error' in data ? String((data as { error?: string }).error) : 'Could not load contacts'
        throw new Error(err)
      }
      const rows = Array.isArray(data) ? data : []
      const mapped: RecipientContact[] = []
      for (const raw of rows) {
        const c = raw as Record<string, unknown>
        const email = typeof c.email === 'string' ? c.email.trim() : ''
        if (!email) continue
        const locId = typeof c.location_id === 'string' ? c.location_id : null
        if (locId && locId !== locationId) continue
        const scope: 'location' | 'account' = locId === locationId ? 'location' : 'account'
        mapped.push({
          id: String(c.id),
          name: typeof c.name === 'string' ? c.name : null,
          email,
          role: typeof c.role === 'string' ? c.role : 'other',
          scope,
          isPrimary: Boolean(c.is_primary),
        })
      }
      setContacts(mapped)
    } catch (e: unknown) {
      setContactsError(e instanceof Error ? e.message : 'Could not load contacts')
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }, [accountId, locationId])

  useEffect(() => {
    void loadContacts()
  }, [loadContacts])

  useEffect(() => {
    if (!placeholderMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = placeholderPanelRef.current
      if (el && !el.contains(e.target as Node)) {
        setPlaceholderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [placeholderMenuOpen])

  const filteredTemplates = useMemo(() => {
    let rows = templates
    if (categoryFilter) rows = rows.filter(t => t.category === categoryFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q),
      )
    }
    return rows
  }, [templates, categoryFilter, search])

  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplateRow[]>()
    for (const c of EMAIL_TEMPLATE_CATEGORIES) {
      map.set(c, [])
    }
    for (const t of filteredTemplates) {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    return EMAIL_TEMPLATE_CATEGORIES.map(cat => ({ cat, items: map.get(cat) ?? [] })).filter(
      g => g.items.length > 0,
    )
  }, [filteredTemplates])

  const showSearch = templates.length > 15

  function insertPlaceholderToken(token: string) {
    if (placeholderTarget === 'subject') {
      setSubject(prev => (prev ? `${prev}${prev.endsWith(' ') ? '' : ' '}` : '') + token)
    } else {
      bodyEditorRef.current?.insertText(token)
    }
    setPlaceholderMenuOpen(false)
  }

  async function handleContinue() {
    setError('')
    if (selection === 'unset') return
    if (selection === 'blank') {
      setEmailTemplateId(null)
      setSubject('')
      setBody('<p></p>')
      setRenderWarnings([])
      setStep(2)
      return
    }
    setContinueLoading(true)
    try {
      const res = await fetch(`/api/templates/${selection.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        subject?: string
        bodyHtml?: string
        warnings?: unknown
        defaultRecipients?: unknown
        defaultCcRecipients?: unknown
      }
      if (!res.ok) throw new Error(data.error ?? 'Could not render template')
      const templateTo = normalizeRecipientList(data.defaultRecipients)
      const templateCc = normalizeRecipientList(data.defaultCcRecipients)
      setEmailTemplateId(selection.id)
      const normalizeEmailHtml = (s: string) =>
        replaceLegacyExpertAssistPreviewUrls(replaceLegacyCapabilitiesPreviewUrls(s))
      setSubject(normalizeEmailHtml(data.subject ?? ''))
      setBody(normalizeEmailHtml(data.bodyHtml ?? '<p></p>'))
      setToList(templateTo.length > 0 ? templateTo : (contactEmail.trim() ? [contactEmail.trim().toLowerCase()] : []))
      setCcList(templateCc)
      setCcOpen(templateCc.length > 0)
      const w = data.warnings
      setRenderWarnings(Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
      setStep(2)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load template')
    } finally {
      setContinueLoading(false)
    }
  }

  async function handleSend() {
    if (toList.length === 0) {
      setError('At least one To recipient is required')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          to: toList,
          cc: ccList,
          subject,
          bodyHtml: body,
          emailTemplateId,
          fromShopDetail: Boolean(fromShopDetail),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? 'Send failed')
      }
      onSent?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!autoContinueFromInitialTemplate) return
    if (autoContinueAttempted) return
    if (step !== 1) return
    if (selection === 'unset' || selection === 'blank') return
    setAutoContinueAttempted(true)
    void handleContinue()
  }, [autoContinueAttempted, autoContinueFromInitialTemplate, selection, step])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (placeholderMenuOpen) {
        setPlaceholderMenuOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, placeholderMenuOpen])

  const recipientLabel = `${contactName || 'Contact'} · ${shopName}`
  const canContinue = selection !== 'unset' && !continueLoading

  const footerRecipients =
    step === 2
      ? `${toList.length} recipient${toList.length === 1 ? '' : 's'}${ccList.length > 0 ? ` · ${ccList.length} Cc` : ''}`
      : null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 py-6 sm:py-10">
      <div className="flex min-h-full items-start justify-center px-4 pb-6 sm:items-center sm:px-6 sm:pb-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-modal-title"
          className="my-auto flex min-h-0 w-full max-h-[min(calc(100dvh-3rem),56rem)] max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-arctic-200 px-5 py-4">
            <div>
              <h2 id="email-modal-title" className="text-sm font-semibold text-onix-800">
                {step === 1 ? 'Send email' : 'Review and send'}
              </h2>
              {step === 2 && emailTemplateId && (
                <p className="mt-0.5 text-xs text-onix-500">
                  Using template: {templates.find(t => t.id === emailTemplateId)?.name ?? '—'}
                </p>
              )}
              {step === 2 && !emailTemplateId && (
                <p className="mt-0.5 text-xs text-onix-500">Blank email</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-lg leading-none text-onix-400 hover:text-onix-600"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-4 px-5 py-4">
              {error && <p className="text-sm text-red-600">{error}</p>}

              {step === 1 && (
                <>
                  <p className="text-xs text-onix-600">
                    To <span className="font-medium text-onix-800">{recipientLabel}</span>
                  </p>
                  <p className="text-xs font-medium text-onix-600">Choose a template</p>
                  {templatesError && <p className="text-sm text-amber-700">{templatesError}</p>}
                  {templatesLoading && <p className="text-sm text-onix-500">Loading templates…</p>}

                  {!templatesLoading && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={categoryFilter}
                          onChange={e => setCategoryFilter(e.target.value)}
                          className="min-w-[14rem] max-w-full rounded-lg border border-arctic-300 py-1.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">All categories</option>
                          {EMAIL_TEMPLATE_CATEGORIES.map(c => (
                            <option key={c} value={c}>
                              {EMAIL_TEMPLATE_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        {showSearch && (
                          <input
                            type="search"
                            placeholder="Search templates…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="min-w-[12rem] flex-1 rounded-lg border border-arctic-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        )}
                      </div>

                      <ul className="space-y-2">
                        <li>
                          <button
                            type="button"
                            onClick={() => setSelection('blank')}
                            className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                              selection === 'blank'
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-arctic-300 bg-white hover:border-brand-300'
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium text-onix-800">Blank email</p>
                              <p className="mt-1 text-xs text-onix-600">
                                Write a custom subject and body from scratch.
                              </p>
                            </div>
                            {selection === 'blank' && (
                              <span className="text-xs font-medium text-brand-700">Selected</span>
                            )}
                          </button>
                        </li>
                        {grouped.map(({ cat, items }) => (
                          <li key={cat} className="pt-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-onix-400">
                              {EMAIL_TEMPLATE_CATEGORY_LABELS[cat]}
                            </p>
                            <ul className="space-y-2">
                              {items.map(t => {
                                const selected =
                                  selection !== 'unset' &&
                                  selection !== 'blank' &&
                                  selection.type === 'template' &&
                                  selection.id === t.id
                                const desc =
                                  (t.description && t.description.trim()) ||
                                  (t.subject.length > 100 ? `${t.subject.slice(0, 100)}…` : t.subject)
                                return (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      onClick={() => setSelection({ type: 'template', id: t.id })}
                                      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                                        selected
                                          ? 'border-brand-500 bg-brand-50'
                                          : 'border-arctic-300 bg-white hover:border-brand-300'
                                      }`}
                                    >
                                      <div className="min-w-0 pr-2">
                                        <p className="text-sm font-medium text-onix-800">{t.name}</p>
                                        <p className="mt-1 line-clamp-2 text-xs text-onix-600">{desc}</p>
                                      </div>
                                      {selected && (
                                        <span className="shrink-0 text-xs font-medium text-brand-700">
                                          Selected
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  {renderWarnings.length > 0 ? (
                    <div
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                      role="status"
                    >
                      <ul className="list-disc space-y-1 pl-4">
                        {renderWarnings.map((w, i) => {
                          const showAdminLink = warningNeedsAdminLink(w)
                          return (
                            <li key={i}>
                              <span>{w}</span>
                              {showAdminLink ? (
                                <>
                                  {' '}
                                  <a
                                    href={`/shops/${locationId}`}
                                    className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
                                  >
                                    Link Admin shop ID
                                  </a>
                                  <span>, then pick the template again.</span>
                                </>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {contactsError ? <p className="text-sm text-amber-700">{contactsError}</p> : null}
                  {contactsLoading ? <p className="text-xs text-onix-500">Loading contacts…</p> : null}
                  <RecipientPicker
                    label="To"
                    required
                    shopName={shopName}
                    accountName={accountName}
                    value={toList}
                    onChange={setToList}
                    contacts={contacts}
                    excludeEmails={ccList}
                    primaryEmail={primaryNorm || null}
                    placeholder="Add recipient"
                  />
                  {!ccOpen && ccList.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setCcOpen(true)}
                      className="text-left text-xs font-medium text-onix-500 hover:text-onix-800"
                    >
                      + Add Cc
                    </button>
                  ) : null}
                  {(ccOpen || ccList.length > 0) && (
                    <RecipientPicker
                      label="Cc"
                      shopName={shopName}
                      accountName={accountName}
                      value={ccList}
                      onChange={setCcList}
                      contacts={contacts}
                      excludeEmails={toList}
                      placeholder="Add Cc"
                    />
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-onix-600">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full rounded border border-arctic-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-onix-600">Body</label>
                      <div ref={placeholderPanelRef} className="relative shrink-0">
                        <button
                          type="button"
                          aria-expanded={placeholderMenuOpen}
                          aria-haspopup="true"
                          onClick={() => setPlaceholderMenuOpen(o => !o)}
                          className="rounded-md border border-arctic-300 bg-white px-2.5 py-1 font-mono text-xs font-medium text-onix-700 shadow-sm hover:bg-arctic-50"
                        >
                          {'{} '}Insert placeholder
                        </button>
                        {placeholderMenuOpen && (
                          <div
                            className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-arctic-200 bg-white p-3 shadow-lg"
                            role="menu"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-onix-400">
                              Insert placeholder
                            </p>
                            <p className="mt-1 text-[11px] text-onix-500">
                              Resolved on send. Choose where to insert:
                            </p>
                            <div className="mt-2 flex rounded-md border border-arctic-200 p-0.5 text-xs">
                              <button
                                type="button"
                                className={`flex-1 rounded px-2 py-1 ${
                                  placeholderTarget === 'body'
                                    ? 'bg-arctic-100 font-medium text-onix-900'
                                    : 'text-onix-600 hover:bg-arctic-50'
                                }`}
                                onClick={() => setPlaceholderTarget('body')}
                              >
                                Body (cursor)
                              </button>
                              <button
                                type="button"
                                className={`flex-1 rounded px-2 py-1 ${
                                  placeholderTarget === 'subject'
                                    ? 'bg-arctic-100 font-medium text-onix-900'
                                    : 'text-onix-600 hover:bg-arctic-50'
                                }`}
                                onClick={() => setPlaceholderTarget('subject')}
                              >
                                Subject (append)
                              </button>
                            </div>
                            <p className="mt-3 text-[10px] font-medium text-violet-800">Merge fields</p>
                            <div className="mt-1.5 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                              {EMAIL_MERGE_PLACEHOLDER_TOKENS.map(token => (
                                <button
                                  key={token}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => insertPlaceholderToken(token)}
                                  className="rounded-full bg-violet-50 px-2 py-0.5 font-mono text-[10px] text-violet-900 hover:bg-violet-100"
                                >
                                  {token}
                                </button>
                              ))}
                            </div>
                            <p className="mt-2 text-[10px] leading-snug text-onix-500">
                              For <span className="font-mono text-onix-700">{'{{capabilities_link}}'}</span>,{' '}
                              <span className="font-mono text-onix-700">{'{{expert_assist_link}}'}</span>,{' '}
                              <span className="font-mono text-onix-700">{'{{enrollment_portal_link}}'}</span>, or{' '}
                              <span className="font-mono text-onix-700">{'{{routable_bank_link}}'}</span>, use the
                              body toolbar <strong>Link</strong> button and pick the placeholder there.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <EmailBodyEditor ref={bodyEditorRef} value={body} onChange={setBody} compact={false} />
                  </div>
                  {showExpertAssistHint && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />
                      The Expert Assist intake link for this shop will be inserted when you send.
                    </div>
                  )}
                  {showCapabilitiesHint && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                      A fresh capabilities link will be generated when you send. Valid for 30 days, scoped
                      to this shop.
                    </div>
                  )}
                  {showRoutableBankLinkHint && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 align-middle" />
                      A direct Routable bank-link URL will be minted when you send. After linking, the shop
                      returns to the onboarding portal automatically.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-arctic-200 bg-white px-5 py-3">
            <p className="text-xs text-onix-500">
              {step === 1
                ? 'Step 1 of 2 · Pick template'
                : `Step 2 of 2 · Review and send${footerRecipients ? ` · ${footerRecipients}` : ''}`}
            </p>
            <div className="flex gap-2">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setStep(1)
                    setError('')
                    setRenderWarnings([])
                    setPlaceholderMenuOpen(false)
                  }}
                  className="rounded px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100"
              >
                Cancel
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  disabled={!canContinue}
                  className="rounded bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-arctic-200 disabled:text-onix-600 disabled:shadow-none"
                >
                  {continueLoading ? 'Loading…' : 'Continue →'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending}
                  className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
