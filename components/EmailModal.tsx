'use client'

import { useEffect, useMemo, useState } from 'react'
import { renderTemplate, type TemplateKey } from '@/lib/email-templates'
import {
  applyIntroVariant,
} from '@/lib/intro-email-variants'
import { plainTextToSimpleHtml } from '@/lib/email-html'
import { EmailBodyEditor } from '@/components/EmailBodyEditor'

interface Props {
  locationId: string
  shopName: string
  contactName: string
  contactEmail: string
  template: TemplateKey
  senderName: string
  /** When true, activity_log stores a footer so the feed shows this send came from shop detail. */
  fromShopDetail?: boolean
  onClose: () => void
  onSent: () => void
}

function buildIntroVars(shopName: string, contactName: string, senderName: string) {
  const cn = contactName || 'there'
  return {
    shop_name: shopName,
    contact_name: cn,
    first_name: cn.trim().split(/\s+/)[0] || 'there',
    sender_name: senderName,
    portal_url: '{{portal_url}}',
  }
}

function buildFreeformIntroBody(contactName: string) {
  const cn = contactName || 'there'
  return `<p>Hi ${escapeHtmlText(cn)},</p>
<p>Please tell us about your capabilities here: <a href="{{portal_url}}">{Form Link}</a></p>
<p>Best,<br>Leo Gomez</p>`
}

function escapeHtmlText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function EmailModal({
  locationId,
  shopName,
  contactName,
  contactEmail,
  template,
  senderName,
  fromShopDetail,
  onClose,
  onSent,
}: Props) {
  const [introMode, setIntroMode] = useState<'welcome' | 'freeform'>('welcome')
  const introVars = useMemo(
    () => buildIntroVars(shopName, contactName, senderName),
    [shopName, contactName, senderName],
  )

  const [subject, setSubject] = useState(() => {
    if (template === 'intro') {
      if (introMode === 'freeform') return ''
      return applyIntroVariant('standard', buildIntroVars(shopName, contactName, senderName)).subject
    }
    return renderTemplate(template, {
      shop_name: shopName,
      contact_name: contactName || 'there',
      sender_name: senderName,
      portal_url: '',
    }).subject
  })

  const [body, setBody] = useState(() => {
    if (template === 'intro') {
      if (introMode === 'freeform') return buildFreeformIntroBody(contactName)
      return applyIntroVariant('standard', buildIntroVars(shopName, contactName, senderName)).body
    }
    return plainTextToSimpleHtml(
      renderTemplate(template, {
        shop_name: shopName,
        contact_name: contactName || 'there',
        sender_name: senderName,
        portal_url: '',
      }).body,
    )
  })

  const [to, setTo] = useState(contactEmail)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (template !== 'intro') return
    if (introMode === 'welcome') {
      const next = applyIntroVariant('standard', introVars)
      setSubject(next.subject)
      setBody(next.body)
      return
    }
    setSubject('RepairWise Follow Up')
    setBody(buildFreeformIntroBody(contactName))
  }, [template, introVars, introMode, contactName])

  useEffect(() => {
    if (template === 'intro') return
    const r = renderTemplate(template, {
      shop_name: shopName,
      contact_name: contactName || 'there',
      sender_name: senderName,
      portal_url: '',
    })
    setSubject(r.subject)
    setBody(plainTextToSimpleHtml(r.body))
  }, [template, shopName, contactName, senderName])

  async function handleSend() {
    if (!to) {
      setError('Recipient email is required')
      return
    }
    setSending(true)
    try {
      let subjectOut = subject
      let bodyOut = body
      if (template === 'intro') {
        const hadPortalPlaceholder = body.includes('{{portal_url}}') || subject.includes('{{portal_url}}')
        const gen = await fetch('/api/portal/generate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId }),
        })
        const genData = (await gen.json().catch(() => ({}))) as { error?: string; portalUrl?: string }
        if (!gen.ok) throw new Error(genData.error ?? 'Could not create portal link')
        const portalUrl = genData.portalUrl
        if (!portalUrl) throw new Error('Could not create portal link')
        const safeUrl = escapeHtmlText(portalUrl)
        subjectOut = subjectOut.split('{{portal_url}}').join(safeUrl)
        bodyOut = bodyOut.split('{{portal_url}}').join(safeUrl)
        if (!hadPortalPlaceholder) {
          bodyOut = `${bodyOut}<p style="margin-top:1em">Please <a href="${safeUrl}">fill out this form</a> so we can better understand your shop's capabilities.</p>`
        }
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          to,
          subject: subjectOut,
          bodyHtml: bodyOut,
          template,
          fromShopDetail: Boolean(fromShopDetail),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSent()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 py-6 sm:py-10">
      <div className="flex min-h-full items-start justify-center px-4 pb-6 sm:items-center sm:px-6 sm:pb-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-modal-title"
          className={`my-auto flex min-h-0 w-full flex-col overflow-hidden rounded-lg bg-white shadow-xl ${
            template === 'intro'
              ? 'max-h-[min(calc(100dvh-3rem),56rem)] max-w-4xl'
              : 'max-h-[min(calc(100dvh-3rem),48rem)] max-w-lg'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-arctic-200 px-5 py-4">
            <h2 id="email-modal-title" className="text-sm font-semibold">
              {template === 'intro' ? 'Send intro email' : 'Send Email'}
            </h2>
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
            <div className="space-y-3 px-5 py-4">
              {error && <p className="text-sm text-red-600">{error}</p>}

              {template === 'intro' && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-onix-600">Choose email type</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setIntroMode('welcome')}
                      className={`rounded-lg border p-3 text-left transition ${
                        introMode === 'welcome'
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-arctic-300 bg-white hover:border-brand-300'
                      }`}
                    >
                      <p className="text-sm font-medium text-onix-900">Welcome email</p>
                      <p className="mt-1 text-xs text-onix-600">
                        Pre-filled overview with the RepairWise partnership details.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntroMode('freeform')}
                      className={`rounded-lg border p-3 text-left transition ${
                        introMode === 'freeform'
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-arctic-300 bg-white hover:border-brand-300'
                      }`}
                    >
                      <p className="text-sm font-medium text-onix-900">Freeform email</p>
                      <p className="mt-1 text-xs text-onix-600">Write a custom subject and body from scratch.</p>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-onix-600">To</label>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="w-full rounded border border-arctic-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
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
                <label className="mb-1 block text-xs font-medium text-onix-600">Body</label>
                <EmailBodyEditor value={body} onChange={setBody} compact={template !== 'intro'} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-arctic-200 bg-white px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
