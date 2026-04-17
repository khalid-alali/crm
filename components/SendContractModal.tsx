'use client'

import { useState } from 'react'

export type SendContractDraftPrefill = {
  id: string
  counterparty_name?: string | null
  counterparty_email?: string | null
  standard_labor_rate?: number | null
  warranty_labor_rate?: number | null
}

interface Props {
  locationId: string
  shop: {
    account_id?: string | null
    accounts?: { business_name?: string | null } | null
  }
  primaryContactName: string
  primaryContactEmail: string
  /** When set, updates this draft then sends; otherwise creates a new contract (requires account link). */
  initialDraft?: SendContractDraftPrefill | null
  fromShopDetail?: boolean
  onClose: () => void
  onSent: () => void
}

export default function SendContractModal({
  locationId,
  shop,
  primaryContactName,
  primaryContactEmail,
  initialDraft,
  fromShopDetail,
  onClose,
  onSent,
}: Props) {
  const [signerName, setSignerName] = useState(
    () => (initialDraft?.counterparty_name?.trim() || primaryContactName || '').trim(),
  )
  const [signerEmail, setSignerEmail] = useState(
    () => (initialDraft?.counterparty_email?.trim() || primaryContactEmail || '').trim(),
  )
  const [standardRate, setStandardRate] = useState(() =>
    initialDraft?.standard_labor_rate != null && Number.isFinite(Number(initialDraft.standard_labor_rate))
      ? String(initialDraft.standard_labor_rate)
      : '',
  )
  const [warrantyRate, setWarrantyRate] = useState(() =>
    initialDraft?.warranty_labor_rate != null && Number.isFinite(Number(initialDraft.warranty_labor_rate))
      ? String(initialDraft.warranty_labor_rate)
      : '',
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const needsAccountLink = !initialDraft?.id && !shop.account_id
  const canSubmit =
    !needsAccountLink &&
    signerName.trim() &&
    signerEmail.trim().includes('@') &&
    standardRate.trim() &&
    Number.isFinite(Number(standardRate)) &&
    Number(standardRate) > 0 &&
    (warrantyRate.trim() === '' || (Number.isFinite(Number(warrantyRate)) && Number(warrantyRate) >= 0))

  async function handleSubmit() {
    if (!canSubmit) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/locations/${locationId}/contracts/zoho-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterparty_name: signerName.trim(),
          counterparty_email: signerEmail.trim(),
          standard_labor_rate: Number(standardRate),
          warranty_labor_rate: warrantyRate.trim() === '' ? null : Number(warrantyRate),
          existing_draft_contract_id: initialDraft?.id ?? null,
          from_shop_detail: Boolean(fromShopDetail),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Request failed')
      onSent()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-arctic-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Send contract via Zoho Sign</h2>
          <button type="button" onClick={onClose} className="text-onix-400 hover:text-onix-600 text-lg leading-none">
            &times;
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {needsAccountLink && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Link an account on the shop page before sending a new contract, or open the Contracts tab if you already have a draft.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">
              Owner (signer) name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">
              Owner (signer) email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={signerEmail}
              onChange={e => setSignerEmail(e.target.value)}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">
              Shop customer pay labor rate ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={standardRate}
              onChange={e => setStandardRate(e.target.value)}
              placeholder="e.g. 125"
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Shop warranty labor rate ($)</label>
            <input
              type="text"
              inputMode="decimal"
              value={warrantyRate}
              onChange={e => setWarrantyRate(e.target.value)}
              placeholder="Optional"
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-arctic-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || sending}
            className="px-4 py-1.5 text-sm bg-onix-800 text-white rounded hover:bg-onix-950 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send via Zoho Sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
