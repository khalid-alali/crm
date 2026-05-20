'use client'

import Link from 'next/link'
import { shopConsultThreadUrl } from '@/lib/expert-assist/shop-consult-url'
import { useCallback, useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js'
import {
  formatUsPhoneDashed,
  stripPhoneToNationalDigits,
  validateUsPhoneOptional,
} from '@/lib/portal-phone-email'

type ExpertAssistPayload = {
  location: {
    id: string
    name: string
    consult_enabled: boolean | null
    consult_short_code: string | null
    toolbox_case_partner: string | null
    consult_billing_email: string | null
    consult_billing_contact_name: string | null
    consult_internal_notes: string | null
    consult_billing_status: string | null
    consult_stripe_customer_id: string | null
    consult_stripe_payment_method_id: string | null
    consult_stripe_card_last4: string | null
  }
  contacts: Array<{
    id: string
    phone_number: string
    display_name: string | null
    status: string
    added_via: string
    created_at: string
  }>
  cases: Array<{
    id: string
    status: string
    created_at: string
    closed_at: string | null
    billed_amount_cents: number | null
  }>
}

function CardForm({ onComplete }: { onComplete: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-3">
      <PaymentElement />
      <button
        type="button"
        disabled={busy || !stripe || !elements}
        onClick={() => {
          void (async () => {
            if (!stripe || !elements) return
            setBusy(true)
            const { error } = await stripe.confirmSetup({
              elements,
              confirmParams: { return_url: window.location.href },
              redirect: 'if_required',
            })
            setBusy(false)
            if (error) window.alert(error.message)
            else {
              window.alert('Card saved. If status does not update immediately, wait a few seconds for Stripe webhook sync.')
              onComplete()
            }
          })()
        }}
        className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save payment method'}
      </button>
    </div>
  )
}

export default function ExpertAssistShopPanel({ locationId }: { locationId: string }) {
  const [payload, setPayload] = useState<ExpertAssistPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    consult_enabled: false,
    consult_short_code: '',
    consult_billing_email: '',
    consult_billing_contact_name: '',
    consult_internal_notes: '',
  })
  const [newPhoneDigits, setNewPhoneDigits] = useState('')
  const [newPhoneFocused, setNewPhoneFocused] = useState(false)
  const [newName, setNewName] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [revokeLoading, setRevokeLoading] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/locations/${locationId}/expert-assist`)
    const data = (await res.json()) as ExpertAssistPayload & { error?: string }
    if (!res.ok) {
      setError(data.error ?? 'Failed to load')
      return
    }
    setPayload(data as ExpertAssistPayload)
    const loc = (data as ExpertAssistPayload).location
    setDraft({
      consult_enabled: Boolean(loc.consult_enabled),
      consult_short_code: loc.consult_short_code ?? '',
      consult_billing_email: loc.consult_billing_email ?? '',
      consult_billing_contact_name: loc.consult_billing_contact_name ?? '',
      consult_internal_notes: loc.consult_internal_notes ?? '',
    })
  }, [locationId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function saveSettings() {
    const res = await fetch(`/api/locations/${locationId}/expert-assist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consult_enabled: draft.consult_enabled,
        consult_short_code: draft.consult_short_code.trim() || null,
        consult_billing_email: draft.consult_billing_email.trim() || null,
        consult_billing_contact_name: draft.consult_billing_contact_name.trim() || null,
        consult_internal_notes: draft.consult_internal_notes || null,
      }),
    })
    const j = (await res.json()) as { error?: string }
    if (!res.ok) {
      window.alert(j.error ?? 'Save failed')
      return
    }
    void reload()
  }

  async function startSetupIntent() {
    const res = await fetch(`/api/locations/${locationId}/expert-assist/setup-intent`, { method: 'POST' })
    const j = (await res.json()) as { clientSecret?: string; publishableKey?: string; error?: string }
    if (!res.ok || !j.clientSecret) {
      window.alert(j.error ?? 'Could not start billing setup')
      return
    }
    setClientSecret(j.clientSecret)
    setPublishableKey(j.publishableKey ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null)
  }

  const stripePromise = publishableKey ? loadStripe(publishableKey) : null
  const elementsOptions: StripeElementsOptions | null =
    clientSecret ? { clientSecret, appearance: { theme: 'stripe' } } : null

  async function addContact() {
    const digits = stripPhoneToNationalDigits(newPhoneDigits)
    const phoneErr = validateUsPhoneOptional(digits)
    if (phoneErr) {
      window.alert(phoneErr)
      return
    }
    const res = await fetch(`/api/locations/${locationId}/expert-assist/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: digits,
        display_name: newName.trim() || null,
        approve_directly: true,
      }),
    })
    const j = (await res.json()) as { error?: string }
    if (!res.ok) {
      window.alert(j.error ?? 'Failed to add contact')
      return
    }
    setNewPhoneDigits('')
    setNewName('')
    void reload()
  }

  if (error && !payload) {
    return <p className="text-sm text-red-600">{error}</p>
  }
  if (!payload) {
    return <p className="text-sm text-onix-500">Loading Expert Assist…</p>
  }

  const loc = payload.location

  async function copyInviteLink() {
    setInviteLoading(true)
    try {
      const res = await fetch('/api/expert-assist/generate-invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      const j = (await res.json()) as { inviteUrl?: string; error?: string }
      if (!res.ok || !j.inviteUrl) {
        window.alert(j.error ?? 'Could not generate invite link')
        return
      }
      setInviteUrl(j.inviteUrl)
      await navigator.clipboard.writeText(j.inviteUrl)
      window.alert('Invite link copied to clipboard')
    } catch {
      window.alert('Could not copy invite link')
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="rounded-lg border border-arctic-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-onix-900">Shop invite link</h3>
        <p className="mt-1 text-sm text-onix-600">
          Send this to the shop for Expert Assist setup, Toolbox referrals, and consult intake.
        </p>
        {inviteUrl ?
          <p className="mt-2 break-all font-mono text-xs text-onix-700">{inviteUrl}</p>
        : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={inviteLoading}
            onClick={() => void copyInviteLink()}
            className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm hover:bg-arctic-50 disabled:opacity-50"
          >
            {inviteLoading ? 'Generating…' : 'Copy invite link'}
          </button>
          <button
            type="button"
            disabled={revokeLoading}
            onClick={() => {
              void (async () => {
                if (!window.confirm('Revoke this shop invite link? Existing URLs will stop working.')) return
                setRevokeLoading(true)
                try {
                  const res = await fetch(`/api/locations/${locationId}/expert-assist/revoke-invite`, {
                    method: 'POST',
                  })
                  const j = (await res.json()) as { error?: string }
                  if (!res.ok) {
                    window.alert(j.error ?? 'Revoke failed')
                    return
                  }
                  setInviteUrl(null)
                  window.alert('Invite link revoked. Generate a new link when ready.')
                  void reload()
                } finally {
                  setRevokeLoading(false)
                }
              })()
            }}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {revokeLoading ? 'Revoking…' : 'Revoke invite link'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-onix-900">Settings</h3>
        <div className="mt-3 space-y-3 rounded-lg border border-arctic-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.consult_enabled}
              onChange={e => setDraft(d => ({ ...d, consult_enabled: e.target.checked }))}
            />
            Expert Assist enabled (requires active billing below)
          </label>
          <label className="block text-sm">
            <span className="text-onix-600">Expert Assist short code (SMS)</span>
            <input
              value={draft.consult_short_code}
              onChange={e => setDraft(d => ({ ...d, consult_short_code: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1 font-mono uppercase"
            />
          </label>
          <label className="block text-sm">
            <span className="text-onix-600">Billing email</span>
            <input
              value={draft.consult_billing_email}
              onChange={e => setDraft(d => ({ ...d, consult_billing_email: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-onix-600">Billing contact name</span>
            <input
              value={draft.consult_billing_contact_name}
              onChange={e => setDraft(d => ({ ...d, consult_billing_contact_name: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-onix-600">Internal notes</span>
            <textarea
              value={draft.consult_internal_notes}
              onChange={e => setDraft(d => ({ ...d, consult_internal_notes: e.target.value }))}
              rows={3}
              className="mt-0.5 w-full rounded border border-arctic-200 px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveSettings()}
            className="rounded-lg bg-onix-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save settings
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-onix-900">Toolbox referral</h3>
        <p className="mt-1 text-xs text-onix-500">
          Auto-generated from shop name (<span className="font-mono">?casePartner=</span>). Spaces removed; if the
          name is taken, last 4 characters of shop id are appended. Shops cannot edit this.
        </p>
        <div className="mt-3 rounded-lg border border-arctic-200 bg-white p-4 text-sm">
          <p className="text-onix-600">Referral code</p>
          <p className="mt-1 font-mono text-lg font-medium text-onix-900">{loc.toolbox_case_partner ?? '—'}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-onix-900">Billing</h3>
        <div className="mt-3 rounded-lg border border-arctic-200 bg-white p-4 text-sm text-onix-800">
          <p>
            Status: <span className="font-medium">{loc.consult_billing_status ?? '—'}</span>
          </p>
          {loc.consult_stripe_card_last4 ?
            <p className="mt-1">Card on file · •••• {loc.consult_stripe_card_last4}</p>
          : <p className="mt-1 text-onix-500">No card on file yet.</p>}
          {!clientSecret || !stripePromise || !elementsOptions ?
            <button
              type="button"
              onClick={() => void startSetupIntent()}
              className="mt-3 rounded-lg border border-arctic-300 px-3 py-1.5 text-sm hover:bg-arctic-50"
            >
              Update card (Stripe)
            </button>
          : (
            <div className="mt-4 max-w-md">
              <Elements stripe={stripePromise} options={elementsOptions}>
                <CardForm
                  onComplete={() => {
                    setClientSecret(null)
                    setPublishableKey(null)
                    void reload()
                  }}
                />
              </Elements>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-onix-900">Approved contacts</h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-arctic-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-arctic-200 bg-arctic-50 text-xs uppercase text-onix-600">
              <tr>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Via</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payload.contacts.map(c => (
                <tr key={c.id} className="border-b border-arctic-100">
                  <td className="px-3 py-2 tabular-nums">{formatUsPhoneDashed(c.phone_number)}</td>
                  <td className="px-3 py-2">{c.display_name ?? '—'}</td>
                  <td className="px-3 py-2">{c.status}</td>
                  <td className="px-3 py-2">{c.added_via}</td>
                  <td className="px-3 py-2 text-right">
                    {c.status !== 'revoked' ?
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => {
                          void (async () => {
                            if (!window.confirm('Revoke this number?')) return
                            const res = await fetch(
                              `/api/locations/${locationId}/expert-assist/contacts/${c.id}`,
                              { method: 'DELETE' }
                            )
                            if (!res.ok) window.alert('Revoke failed')
                            void reload()
                          })()
                        }}
                      >
                        Revoke
                      </button>
                    : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-end gap-2 border-t border-arctic-200 p-3">
            <label className="text-xs">
              Phone
              <input
                type="tel"
                inputMode="numeric"
                value={
                  newPhoneFocused ? newPhoneDigits : formatUsPhoneDashed(newPhoneDigits)
                }
                onFocus={() => setNewPhoneFocused(true)}
                onChange={e => setNewPhoneDigits(stripPhoneToNationalDigits(e.target.value))}
                onBlur={() => {
                  setNewPhoneFocused(false)
                  setNewPhoneDigits(stripPhoneToNationalDigits(newPhoneDigits))
                }}
                className="mt-0.5 block w-40 rounded border border-arctic-200 px-2 py-1 text-sm tabular-nums"
                placeholder="555-555-5555"
                autoComplete="tel"
              />
            </label>
            <label className="text-xs">
              Display name
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="mt-0.5 block w-40 rounded border border-arctic-200 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void addContact()}
              className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm text-white"
            >
              Add approved contact
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-onix-900">Case history</h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-arctic-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-arctic-200 bg-arctic-50 text-xs uppercase text-onix-600">
              <tr>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Billed</th>
                <th className="px-3 py-2">Shop web</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payload.cases.length === 0 ?
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-onix-500">
                    No cases yet.
                  </td>
                </tr>
              : payload.cases.map(cs => (
                  <tr key={cs.id} className="border-b border-arctic-100">
                    <td className="px-3 py-2">{new Date(cs.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{cs.status}</td>
                    <td className="px-3 py-2">
                      {cs.billed_amount_cents != null ? `$${(cs.billed_amount_cents / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {cs.status === 'open' ?
                        <button
                          type="button"
                          className="text-xs text-brand-700 hover:underline"
                          onClick={() => {
                            const url = shopConsultThreadUrl(locationId, cs.id)
                            void navigator.clipboard.writeText(url)
                            window.alert('Shop web consult link copied')
                          }}
                        >
                          Copy web link
                        </button>
                      : <span className="text-xs text-onix-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/consults/${cs.id}`} className="text-brand-700 hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
