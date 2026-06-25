'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Check, Loader2, Mail, Send, X } from 'lucide-react'

type Invite = {
  id: string
  email: string
  status: string
  sent_at: string | null
  completed_at: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MUTED = 'text-[#5f6571]'

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function relTime(iso: string | null): string {
  if (!iso) return 'just now'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const secs = Math.round((Date.now() - d) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`
  return fmtDate(iso)
}

function StatusBadge({ invite }: { invite: Invite }) {
  if (invite.status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#cfffcd] px-2.5 py-0.5 text-xs font-medium text-[#1f6b2e]">
        <Check size={12} aria-hidden /> Completed {fmtDate(invite.completed_at)}
      </span>
    )
  }
  if (invite.status === 'bounced') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#ef5f4b]/12 px-2.5 py-0.5 text-xs font-medium text-[#993c1d]">
        Email bounced
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#687cf9]/10 px-2.5 py-0.5 text-xs font-medium text-[#3f47c4]">
      Invited {relTime(invite.sent_at)}
    </span>
  )
}

export default function TechnicianInviteClient({ token }: { token: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [resending, setResending] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    fetch(`/api/portal/${token}/survey/technicians`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? 'This link has expired.' : 'Something went wrong.')
        return r.json()
      })
      .then((d: { invites: Invite[] }) => {
        if (!off) setInvites(d.invites ?? [])
      })
      .catch(e => !off && setError(e.message))
    return () => {
      off = true
    }
  }, [token])

  const summary = useMemo(() => {
    const list = invites ?? []
    const completed = list.filter(i => i.status === 'completed').length
    const pendingCount = list.length - completed
    return { completed, pending: pendingCount }
  }, [invites])

  function commitDraft(): void {
    const parts = draft
      .split(/[,\n]/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
    if (parts.length === 0) return
    setPending(prev => {
      const next = [...prev]
      for (const p of parts) {
        if (EMAIL_RE.test(p) && !next.includes(p)) next.push(p)
      }
      return next
    })
    setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && draft === '' && pending.length > 0) {
      setPending(prev => prev.slice(0, -1))
    }
  }

  function removeChip(email: string): void {
    setPending(prev => prev.filter(e => e !== email))
  }

  async function sendInvites(): Promise<void> {
    // Fold any half-typed entry into the chips before sending.
    const trailing = draft.trim().toLowerCase()
    const emails = [...pending]
    if (EMAIL_RE.test(trailing) && !emails.includes(trailing)) emails.push(trailing)
    if (emails.length === 0) return

    setSending(true)
    setError(null)
    try {
      const r = await fetch(`/api/portal/${token}/survey/technicians`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (!r.ok) throw new Error(r.status === 401 ? 'This link has expired.' : 'Could not send invites.')
      const d: { invites: Invite[] } = await r.json()
      setInvites(d.invites ?? [])
      setPending([])
      setDraft('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function resend(id: string): Promise<void> {
    setResending(id)
    setError(null)
    try {
      const r = await fetch(`/api/portal/${token}/survey/technicians`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId: id, action: 'resend' }),
      })
      if (!r.ok) throw new Error(r.status === 401 ? 'This link has expired.' : 'Could not resend.')
      // Optimistically bump sent_at so the relative time refreshes.
      setInvites(prev =>
        (prev ?? []).map(i => (i.id === id ? { ...i, sent_at: new Date().toISOString() } : i)),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setResending(null)
    }
  }

  const sendCount = pending.length + (EMAIL_RE.test(draft.trim().toLowerCase()) ? 1 : 0)

  return (
    <div className="min-h-screen bg-[#eceef1] p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/portal/${token}/onboarding`}
          className={`mb-3 inline-flex items-center gap-1.5 text-sm ${MUTED} hover:text-[#0f1114]`}
        >
          <ArrowLeft size={15} aria-hidden /> Back to onboarding
        </a>
        <div className="rounded-2xl border border-[#0f1114]/10 bg-[#f9f9fb] p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0f1114]">Invite your technicians</h1>
          <p className={`mt-2 text-sm ${MUTED}`}>
            Add the techs who&apos;ll work on VinFast vehicles. Each gets their own link to add their
            certifications.
          </p>

          {error && <p className="mt-5 text-sm text-[#993c1d]">{error}</p>}

          {/* Email entry */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#cfd2d8] bg-white px-2 py-2 focus-within:border-[#687cf9] focus-within:ring-1 focus-within:ring-[#687cf9]">
              {pending.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-md bg-[#687cf9]/10 py-1 pl-2.5 pr-1 text-sm text-[#3f47c4]"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeChip(email)}
                    className="rounded p-0.5 hover:bg-[#687cf9]/20"
                    aria-label={`Remove ${email}`}
                  >
                    <X size={13} aria-hidden />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={commitDraft}
                placeholder={pending.length === 0 ? 'tech@email.com — press Enter to add' : 'Add another…'}
                className="min-w-[12rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-[#0f1114] outline-none placeholder:text-[#9aa0ab]"
              />
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={sendInvites}
                disabled={sending || sendCount === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[#687cf9] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" aria-hidden /> Sending…
                  </>
                ) : (
                  <>
                    <Send size={15} aria-hidden /> Send {sendCount > 0 ? sendCount : ''} invite
                    {sendCount === 1 ? '' : 's'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Roster */}
          <div className="mt-8 border-t border-[#0f1114]/10 pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#0f1114]">Technicians</h2>
              {invites && invites.length > 0 && (
                <span className={`text-xs ${MUTED}`}>
                  {summary.completed} completed · {summary.pending} pending
                </span>
              )}
            </div>

            {invites === null ? (
              <p className={`mt-4 flex items-center gap-2 text-sm ${MUTED}`}>
                <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
              </p>
            ) : invites.length === 0 ? (
              <p className={`mt-4 flex items-center gap-2 text-sm ${MUTED}`}>
                <Mail size={15} aria-hidden /> No technicians invited yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#0f1114]/8">
                {invites.map(invite => (
                  <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0f1114]">{invite.email}</p>
                      <div className="mt-1">
                        <StatusBadge invite={invite} />
                      </div>
                    </div>
                    {invite.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => resend(invite.id)}
                        disabled={resending === invite.id}
                        className="flex-none rounded-lg border border-[#cfd2d8] px-3 py-1.5 text-xs font-medium text-[#5f6571] hover:text-[#0f1114] disabled:opacity-60"
                      >
                        {resending === invite.id ? 'Resending…' : 'Resend'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
