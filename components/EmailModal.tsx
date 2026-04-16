'use client'

import { useState } from 'react'
import { renderTemplate, type TemplateKey } from '@/lib/email-templates'

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
  const rendered = renderTemplate(template, {
    shop_name: shopName,
    contact_name: contactName || 'there',
    sender_name: senderName,
  })

  const [subject, setSubject] = useState(rendered.subject)
  const [body, setBody] = useState(rendered.body)
  const [to, setTo] = useState(contactEmail)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to) { setError('Recipient email is required'); return }
    setSending(true)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          to,
          subject,
          body,
          template,
          fromShopDetail: Boolean(fromShopDetail),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSent()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-5 py-4 border-b border-arctic-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Send Email</h2>
          <button onClick={onClose} className="text-onix-400 hover:text-onix-600 text-lg leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-arctic-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100 rounded">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
