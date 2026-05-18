'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImageIcon,
  Paperclip,
  Pause,
  Send,
  Square,
  X,
} from 'lucide-react'
import {
  CONSULT_MMS_ALLOWED_CONTENT_TYPES,
  CONSULT_MMS_MAX_BYTES,
  validateConsultMmsUpload,
} from '@/lib/expert-assist/consult-media'
import { formatUsPhoneDashed } from '@/lib/portal-phone-email'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildTranscriptItems,
  CANNED_RESPONSES,
  countActivity,
  deriveCaseTitle,
  formatBillingBreakdown,
  formatCaseMeta,
  formatMessageTime,
  getBallCourtStatusLabel,
  getCasePillLabel,
  isTimerRunning,
  OUTCOME_GRID,
  timerProgressPercent,
  totalBillableSeconds,
  vehicleHeadline,
  vehicleSubline,
} from '@/lib/expert-assist/case-display'
import type { ConsultCaseShopContext } from '@/lib/expert-assist/queries'
import {
  formatTimerClock,
  formatWaitMinutes,
  getQueuePill,
  waitAnchorIso,
} from '@/lib/expert-assist/queue-display'
import type { ConsultMessageRow } from '@/lib/expert-assist/types'

import './expert-assist-case.css'

import { MessageBubble, pillClass, type CaseDetailModel } from './ConsultCaseDetail'

const CLOSE_UNDO_MS = 5000

export default function ConsultCaseDetailView({
  caseId,
  caseRow,
  messages,
  shopContext,
  prevCaseId,
  nextCaseId,
}: {
  caseId: string
  caseRow: CaseDetailModel
  messages: ConsultMessageRow[]
  shopContext: ConsultCaseShopContext | null
  prevCaseId: string | null
  nextCaseId: string | null
}) {
  const router = useRouter()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<File | null>(null)
  const [pendingMediaPreview, setPendingMediaPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState(caseRow.expert_notes ?? '')
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null)
  const [outcome, setOutcome] = useState(caseRow.outcome ?? '')
  const [vin, setVin] = useState(caseRow.vin ?? '')
  const [vinSaved, setVinSaved] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [closeToast, setCloseToast] = useState<{ amountLabel: string; secondsLeft: number } | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closeAbortRef = useRef<AbortController | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const needsApproval = caseRow.status === 'awaiting_expert_approval'
  const isOpen = caseRow.status === 'open'
  const readOnly =
    caseRow.status === 'closed' || caseRow.status === 'cancelled' || caseRow.status === 'billing_failed'

  useEffect(() => {
    setNotes(caseRow.expert_notes ?? '')
    setOutcome(caseRow.outcome ?? '')
    setVin(caseRow.vin ?? '')
  }, [caseRow.expert_notes, caseRow.outcome, caseRow.vin])

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 12000)
    return () => window.clearInterval(t)
  }, [router])

  useEffect(() => {
    return () => {
      if (pendingMediaPreview) URL.revokeObjectURL(pendingMediaPreview)
    }
  }, [pendingMediaPreview])

  const refresh = useCallback(() => router.refresh(), [router])

  const meta = useMemo(() => formatCaseMeta(caseRow, nowMs), [caseRow, nowMs])
  const pillKind = getQueuePill(caseRow)
  const title = useMemo(() => deriveCaseTitle(caseRow, messages), [caseRow, messages])
  const transcriptItems = useMemo(() => buildTranscriptItems(messages), [messages])
  const activity = useMemo(() => countActivity(messages), [messages])
  const timerRunning = isTimerRunning(caseRow, nowMs)
  const billableSecs = totalBillableSeconds(caseRow, nowMs)
  const billing = useMemo(() => formatBillingBreakdown(billableSecs), [billableSecs])
  const progressPct = timerProgressPercent(billableSecs)
  const displayTimer = formatTimerClock(billableSecs)

  const shopName = caseRow.shop?.name ?? 'Shop'
  const contactName = caseRow.contact?.display_name?.trim() || 'Contact'
  const phone = caseRow.contact?.phone_number ?? caseRow.originating_phone_number
  const phoneDisplay = phone ? formatUsPhoneDashed(phone) : '—'
  const composerPlaceholder = `Reply to ${contactName} at ${shopName}…`

  async function postJson(url: string, body?: object) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? res.statusText)
    return data
  }

  async function patchJson(url: string, body: object) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? res.statusText)
    return data
  }

  useEffect(() => {
    if (!isOpen || readOnly) return
    const t = window.setTimeout(() => {
      void patchJson(`/api/consults/${caseId}`, { expert_notes: notes })
        .then(() => setNotesSavedAt(Date.now()))
        .catch(() => undefined)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [notes, caseId, isOpen, readOnly])

  function navigateCase(id: string | null) {
    if (id) router.push(`/consults/${id}`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        navigateCase(prevCaseId)
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        navigateCase(nextCaseId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevCaseId, nextCaseId, router])

  function applyCanned(template: string) {
    setDraft(prev => (prev.trim() ? `${prev.trim()}\n\n${template}` : template))
    composerRef.current?.focus()
  }

  function clearPendingMedia() {
    if (pendingMediaPreview) URL.revokeObjectURL(pendingMediaPreview)
    setPendingMedia(null)
    setPendingMediaPreview(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }

  function onMediaSelected(file: File | null) {
    clearPendingMedia()
    if (!file) return
    const err = validateConsultMmsUpload(file.type || 'application/octet-stream', file.size)
    if (err) {
      window.alert(err)
      return
    }
    setPendingMedia(file)
    setPendingMediaPreview(URL.createObjectURL(file))
  }

  async function sendReply() {
    const text = draft.trim()
    if ((!text && !pendingMedia) || !isOpen) return
    setSending(true)
    try {
      if (pendingMedia) {
        const form = new FormData()
        if (text) form.set('text', text)
        form.set('media', pendingMedia)
        const res = await fetch(`/api/consults/${caseId}/messages`, { method: 'POST', body: form })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? res.statusText)
      } else {
        await postJson(`/api/consults/${caseId}/messages`, { text })
      }
      setDraft('')
      clearPendingMedia()
      refresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const canSend = isOpen && !sending && (draft.trim().length > 0 || pendingMedia !== null)

  function clearCloseToast() {
    if (closeTimerRef.current) clearInterval(closeTimerRef.current)
    closeAbortRef.current?.abort()
    closeAbortRef.current = null
    closeTimerRef.current = null
    setCloseToast(null)
  }

  function scheduleCloseCharge(amountLabel: string) {
    clearCloseToast()
    const started = Date.now()
    setCloseToast({ amountLabel, secondsLeft: 5 })
    const controller = new AbortController()
    closeAbortRef.current = controller

    closeTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - started
      const left = Math.max(0, Math.ceil((CLOSE_UNDO_MS - elapsed) / 1000))
      setCloseToast(t => (t ? { ...t, secondsLeft: left } : null))
      if (elapsed >= CLOSE_UNDO_MS && closeTimerRef.current) {
        clearInterval(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }, 200)

    window.setTimeout(() => {
      if (controller.signal.aborted) return
      void (async () => {
        setBusy('close')
        try {
          await postJson(`/api/consults/${caseId}/close`, {})
          setCloseToast(null)
          refresh()
        } catch (e) {
          window.alert(e instanceof Error ? e.message : 'Close failed')
        } finally {
          setBusy(null)
        }
      })()
    }, CLOSE_UNDO_MS)
  }

  function handleCloseClick() {
    if (timerRunning) {
      window.alert('Stop the timer before closing this case.')
      return
    }
    if (!outcome) return
    scheduleCloseCharge(billing.totalLabel)
  }

  async function saveVin() {
    try {
      await patchJson(`/api/consults/${caseId}`, { vin: vin.trim() || null })
      setVinSaved(true)
      window.setTimeout(() => setVinSaved(false), 2000)
      refresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function parseVinToVehicle() {
    const v = vin.trim()
    if (v.length !== 17) {
      window.alert('Enter a valid 17-character VIN first.')
      return
    }
    setBusy('vin')
    try {
      await patchJson(`/api/consults/${caseId}`, { vin: v })
      refresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'VIN decode failed')
    } finally {
      setBusy(null)
    }
  }

  const priorLabel =
    shopContext && shopContext.prior_consult_count > 0 ?
      shopContext.last_prior_consult_at ?
        `${shopContext.prior_consult_count} · last ${formatWaitMinutes(shopContext.last_prior_consult_at, nowMs)} ago`
      : `${shopContext.prior_consult_count}`
    : '0'

  const headline = vehicleHeadline(caseRow)

  return (
    <div className="ea-case ea-surface flex min-h-0 flex-1 flex-col">
      <div className="ea-shell">
        <header className="ea-topbar">
          <nav className="ea-breadcrumb" aria-label="Breadcrumb">
            <Link href="/home">Home</Link>
            <span className="ea-sep">/</span>
            <Link href="/consults">Consults</Link>
            <span className="ea-sep">/</span>
            <span className="ea-current">{meta.displayId}</span>
          </nav>
          <div className="ea-topbar-meta">
            <span>
              Case <strong>{meta.displayId}</strong>
            </span>
            <span>
              Created <strong>{meta.createdTime}</strong>
            </span>
            <span>
              Waiting{' '}
              <strong style={meta.waitingAction ? { color: 'var(--ea-action)' } : undefined}>
                {meta.waitingLabel}
              </strong>
            </span>
            <div className="ea-nav-arrows">
              <button
                type="button"
                className="ea-nav-btn"
                title="Previous case (J)"
                disabled={!prevCaseId}
                onClick={() => navigateCase(prevCaseId)}
                aria-label="Previous case"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="ea-nav-btn"
                title="Next case (K)"
                disabled={!nextCaseId}
                onClick={() => navigateCase(nextCaseId)}
                aria-label="Next case"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </header>

        <div className="ea-main">
          <section className="ea-work" aria-label="Conversation">
            {needsApproval ?
              <div className="ea-approval-banner" role="status">
                <span>Pending approval for this number.</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  className="ea-send-btn"
                  onClick={() => {
                    void (async () => {
                      setBusy('approve')
                      try {
                        await postJson(`/api/consults/${caseId}/approve`)
                        refresh()
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : 'Approve failed')
                      } finally {
                        setBusy(null)
                      }
                    })()
                  }}
                >
                  {busy === 'approve' ? 'Working…' : 'Approve & open'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  className="ea-timer-btn"
                  onClick={() => {
                    void (async () => {
                      if (!window.confirm('Reject this claim?')) return
                      setBusy('reject')
                      try {
                        await postJson(`/api/consults/${caseId}/reject`, {})
                        refresh()
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : 'Reject failed')
                      } finally {
                        setBusy(null)
                      }
                    })()
                  }}
                >
                  Reject
                </button>
              </div>
            : null}

            <header className="ea-work-header">
              <div className="ea-case-id-row">
                <span className="ea-case-id">{meta.displayId}</span>
                <span className={pillClass(pillKind)} role="status">
                  <span className="sr-only">Status: </span>
                  {getCasePillLabel(pillKind)}
                </span>
              </div>
              <h1 className="ea-case-title">{title}</h1>
              <p className="ea-case-subtitle">
                <strong>{shopName}</strong>
                <span className="ea-dot">·</span>
                {contactName}
                <span className="ea-dot">·</span>
                Inbound {formatMessageTime(caseRow.created_at)}
              </p>
            </header>

            <div
              className="ea-transcript"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {transcriptItems.length === 0 ?
                <p className="text-center text-sm" style={{ color: 'var(--ea-text-muted)' }}>
                  No messages yet.
                </p>
              : transcriptItems.map(item =>
                  item.type === 'day' ?
                    <div key={item.key} className="ea-day-divider">
                      <span>{item.label}</span>
                    </div>
                  : <MessageBubble
                      key={item.key}
                      m={item.message}
                      shopName={shopName}
                      contactName={contactName}
                      onImageClick={setLightboxUrl}
                    />
                )}
            </div>

            <footer className="ea-composer">
              <div className="ea-canned" role="group" aria-label="Canned responses">
                {CANNED_RESPONSES.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    className="ea-canned-chip"
                    disabled={!isOpen || sending}
                    onClick={() => applyCanned(chip.template)}
                  >
                    {chip.id === 'vin' ?
                      <Clock size={12} aria-hidden />
                    : chip.id === 'photo' ?
                      <ImageIcon size={12} aria-hidden />
                    : chip.id === 'toolbox' ?
                      <Send size={12} aria-hidden />
                    : <CheckCheck size={12} aria-hidden />}
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="ea-composer-box">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept={Array.from(CONSULT_MMS_ALLOWED_CONTENT_TYPES).join(',')}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={e => onMediaSelected(e.target.files?.[0] ?? null)}
                />
                {pendingMedia && pendingMediaPreview ?
                  <div className="ea-composer-pending-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pendingMediaPreview} alt="" />
                    <span className="ea-composer-pending-name">{pendingMedia.name}</span>
                    <button
                      type="button"
                      className="ea-composer-pending-remove"
                      title="Remove photo"
                      disabled={sending}
                      onClick={clearPendingMedia}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                : null}
                <textarea
                  ref={composerRef}
                  className="ea-composer-input"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  disabled={!isOpen || sending}
                  placeholder={isOpen ? composerPlaceholder : 'Open this consult to send SMS.'}
                  rows={3}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void sendReply()
                    }
                    if (e.key === 'Escape') e.currentTarget.blur()
                  }}
                />
                <div className="ea-composer-toolbar">
                  <button
                    type="button"
                    className="ea-composer-tool"
                    title={`Attach photo (max ${Math.round(CONSULT_MMS_MAX_BYTES / (1024 * 1024))} MB)`}
                    disabled={!isOpen || sending}
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    <Paperclip size={14} />
                  </button>
                  <span className="ea-composer-hint">
                    <kbd>⌘</kbd> <kbd>↵</kbd> to send
                  </span>
                  <button
                    type="button"
                    className="ea-send-btn"
                    disabled={!canSend}
                    onClick={() => void sendReply()}
                  >
                    {sending ? 'Sending…' : 'Send'}
                    <Send size={12} aria-hidden />
                  </button>
                </div>
              </div>
            </footer>
          </section>

          <aside className="ea-rail" aria-label="Case context">
            <div
              className={`ea-timer-block${timerRunning ? ' ea-running' : ''}`}
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="ea-timer-label">
                {timerRunning ?
                  <>
                    <span className="ea-rec-dot" aria-hidden />
                    Timer running
                  </>
                : 'Timer'}
              </div>
              <div className="ea-timer-display" aria-label={`Billable time ${displayTimer}`}>
                {displayTimer}
              </div>
              {timerRunning || billableSecs > 0 ?
                <>
                  <div className={`ea-timer-billing${billing.billableWarn ? ' ea-warn' : ''}`}>
                    <span>Billable so far</span>
                    <strong>{billing.totalLabel}</strong>
                  </div>
                  <div className="ea-timer-billing">
                    <span>Approaching 20m</span>
                    <strong>→ $150/hr after</strong>
                  </div>
                  <div className="ea-timer-progress" title="20-minute minimum">
                    <div
                      className="ea-timer-progress-fill"
                      style={{ width: `${progressPct}%` }}
                    />
                    <div className="ea-timer-progress-mark" />
                  </div>
                </>
              : null}
              <div className="ea-timer-controls">
                {timerRunning ?
                  <>
                    <button
                      type="button"
                      className="ea-timer-btn"
                      disabled={!isOpen || busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('timer')
                          try {
                            await postJson(`/api/consults/${caseId}/timer`, { action: 'pause' })
                            refresh()
                          } catch (e) {
                            window.alert(e instanceof Error ? e.message : 'Timer failed')
                          } finally {
                            setBusy(null)
                          }
                        })()
                      }}
                    >
                      <Pause size={12} aria-hidden />
                      Pause
                    </button>
                    <button
                      type="button"
                      className="ea-timer-btn"
                      disabled={!isOpen || busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('timer')
                          try {
                            await postJson(`/api/consults/${caseId}/timer`, { action: 'stop' })
                            refresh()
                          } catch (e) {
                            window.alert(e instanceof Error ? e.message : 'Timer failed')
                          } finally {
                            setBusy(null)
                          }
                        })()
                      }}
                    >
                      <Square size={12} aria-hidden />
                      Stop
                    </button>
                  </>
                : <button
                    type="button"
                    className="ea-timer-btn ea-primary"
                    disabled={!isOpen || busy !== null}
                    onClick={() => {
                      void (async () => {
                        setBusy('timer')
                        try {
                          await postJson(`/api/consults/${caseId}/timer`, { action: 'start' })
                          refresh()
                        } catch (e) {
                          window.alert(e instanceof Error ? e.message : 'Timer failed')
                        } finally {
                          setBusy(null)
                        }
                      })()
                    }}
                  >
                    Start
                  </button>
                }
              </div>
            </div>

            <section className="ea-rail-section">
              <h2 className="ea-section-label">Case</h2>
              <div className="ea-field-row">
                <span className="ea-field-label">Status</span>
                <span className="ea-field-value">{getBallCourtStatusLabel(caseRow)}</span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Created</span>
                <span className="ea-field-value">{meta.createdTime}</span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Waiting on you</span>
                <span
                  className="ea-field-value"
                  style={meta.waitingAction ? { color: 'var(--ea-action)' } : undefined}
                >
                  {formatWaitMinutes(waitAnchorIso(caseRow), nowMs)}
                </span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Activity</span>
                <span className="ea-field-value">
                  {activity.messages} messages · {activity.calls} call{activity.calls === 1 ? '' : 's'}
                </span>
              </div>
            </section>

            <section className="ea-rail-section">
              <h2 className="ea-section-label">Vehicle</h2>
              {headline ?
                <div className="ea-vehicle-card">
                  <div className="ea-vehicle-headline">{headline}</div>
                  <div className="ea-vehicle-sub">{vehicleSubline(caseRow)}</div>
                </div>
              : <p className="text-sm" style={{ color: 'var(--ea-text-muted)' }}>
                  No vehicle detected from messages yet.
                </p>
              }
              {!headline && !readOnly ?
                <button type="button" className="ea-vehicle-link" onClick={() => void parseVinToVehicle()}>
                  Parse vehicle from VIN
                </button>
              : null}
              <input
                className="ea-vehicle-vin"
                value={vin}
                onChange={e => setVin(e.target.value)}
                onBlur={() => {
                  if (!readOnly) void saveVin()
                }}
                disabled={readOnly}
                placeholder="VIN (not yet provided)"
                aria-label="Vehicle identification number"
              />
              {vinSaved ?
                <p className="mt-1 text-xs" style={{ color: 'var(--ea-text-muted)' }}>
                  Saved
                </p>
              : null}
            </section>

            <section className="ea-rail-section">
              <h2 className="ea-section-label">Shop</h2>
              {caseRow.shop_id ?
                <div className="ea-field-row">
                  <span className="ea-field-label">Name</span>
                  <span className="ea-field-value">
                    <Link href={`/shops/${caseRow.shop_id}`}>{shopName}</Link>
                  </span>
                </div>
              : null}
              <div className="ea-field-row">
                <span className="ea-field-label">Shop code</span>
                <span className="ea-field-value ea-mono">{shopContext?.consult_short_code ?? '—'}</span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Contact</span>
                <span className="ea-field-value">
                  {contactName}
                  {caseRow.contact?.status ? ` (${caseRow.contact.status})` : ''}
                </span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Phone</span>
                <span className="ea-field-value ea-mono">
                  {phone ?
                    <a href={`tel:${phone}`}>{phoneDisplay}</a>
                  : '—'}
                </span>
              </div>
              <div className="ea-field-row">
                <span className="ea-field-label">Prior consults</span>
                <span className="ea-field-value">{priorLabel}</span>
              </div>
            </section>

            <section className="ea-rail-section">
              <h2 className="ea-section-label">Internal notes</h2>
              <textarea
                className="ea-notes-area"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={readOnly}
                placeholder="Notes only you see. Captures context for billing, future cases, or Toolbox handoff…"
              />
              <div className="ea-notes-foot">
                <span>
                  {notesSavedAt ?
                    `Auto-saved ${formatWaitMinutes(new Date(notesSavedAt).toISOString(), nowMs)} ago`
                  : ' '}
                </span>
                <span>Not visible to shop</span>
              </div>
            </section>

            {!readOnly ?
              <section className="ea-rail-section ea-close-section">
                <h2 className="ea-section-label">Close case</h2>
                <div className="ea-outcome-grid" role="group" aria-label="Case outcome">
                  {OUTCOME_GRID.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`ea-outcome-opt${outcome === opt.value ? ' ea-selected' : ''}`}
                      onClick={() => {
                        setOutcome(opt.value)
                        void patchJson(`/api/consults/${caseId}`, { outcome: opt.value }).then(() => refresh())
                      }}
                    >
                      <strong>{opt.title}</strong>
                      <span>{opt.subtitle}</span>
                    </button>
                  ))}
                </div>
                <div className="ea-close-summary">
                  <div className="ea-close-summary-row">
                    <span className="ea-label">Time tracked</span>
                    <span className="ea-value">{billing.timeLabel}</span>
                  </div>
                  <div className="ea-close-summary-row">
                    <span className="ea-label">Base (≤20 min)</span>
                    <span className="ea-value">{billing.baseLabel}</span>
                  </div>
                  <div className="ea-close-summary-row">
                    <span className="ea-label">Overage</span>
                    <span className="ea-value">{billing.overageLabel}</span>
                  </div>
                  <div className="ea-close-summary-row ea-total">
                    <span className="ea-label">Charge to card on file</span>
                    <span className="ea-value">{billing.totalLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ea-close-btn"
                  disabled={!isOpen || busy !== null || !outcome || timerRunning}
                  onClick={handleCloseClick}
                >
                  Close & charge {billing.totalLabel}
                  <ChevronRight size={14} aria-hidden />
                </button>
                <p className="ea-close-foot">
                  {shopContext?.consult_stripe_card_last4 ?
                    <>
                      Charges <strong>•••• {shopContext.consult_stripe_card_last4}</strong>.
                    </>
                  : null}
                  {shopContext?.consult_billing_email ?
                    <> Receipt to {shopContext.consult_billing_email}.</>
                  : null}
                  <br />
                  Shop gets SMS confirmation.
                </p>
              </section>
            : null}
          </aside>
        </div>
      </div>

      {lightboxUrl ?
        <button
          type="button"
          className="ea-lightbox"
          onClick={() => setLightboxUrl(null)}
          aria-label="Close image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Attachment preview" />
        </button>
      : null}

      {closeToast ?
        <div className="ea-toast" role="status">
          <div
            className="ea-toast-progress"
            style={{ width: `${((5 - closeToast.secondsLeft) / 5) * 100}%` }}
          />
          Case closed. Charging {closeToast.amountLabel} in {closeToast.secondsLeft}…
          <button type="button" className="ea-toast-undo" onClick={clearCloseToast}>
            Undo
          </button>
        </div>
      : null}
    </div>
  )
}
