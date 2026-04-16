'use client'

import { useState } from 'react'

interface Props {
  locationId: string
  contractId: string
  initialRecipientName: string
  initialRecipientEmail: string
  fromShopDetail?: boolean
  onClose: () => void
  onDone: () => void
}

export default function ReviseSentContractModal({
  locationId,
  contractId,
  initialRecipientName,
  initialRecipientEmail,
  fromShopDetail,
  onClose,
  onDone,
}: Props) {
  const [recipientName, setRecipientName] = useState(() => initialRecipientName.trim())
  const [recipientEmail, setRecipientEmail] = useState(() => initialRecipientEmail.trim())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit =
    recipientName.trim().length > 0 &&
    recipientEmail.trim().includes('@') &&
    (recipientName.trim() !== initialRecipientName.trim() ||
      recipientEmail.trim().toLowerCase() !== initialRecipientEmail.trim().toLowerCase())

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/locations/${locationId}/contracts/${contractId}/zoho-revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterparty_name: recipientName.trim(),
          counterparty_email: recipientEmail.trim(),
          from_shop_detail: Boolean(fromShopDetail),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed')
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-arctic-200 px-5 py-4">
          <h2 className="text-sm font-semibold">Revise signer & resubmit</h2>
          <button type="button" onClick={onClose} className="text-lg leading-none text-onix-400 hover:text-onix-600">
            &times;
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-onix-600">
            The agreement is recalled in Zoho Sign, the signer name and email are updated, then it is sent again to
            the new recipient. Use this when the envelope was sent to the wrong person or with the wrong spelling.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-onix-600">
              Signer name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              className="w-full rounded border border-arctic-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-onix-600">
              Signer email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
              className="w-full rounded border border-arctic-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-arctic-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="rounded bg-onix-800 px-4 py-1.5 text-sm text-white hover:bg-onix-950 disabled:opacity-50"
          >
            {saving ? 'Updating…' : 'Recall, update & resubmit'}
          </button>
        </div>
      </div>
    </div>
  )
}
