'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { detectChain, KNOWN_CHAINS } from '@/lib/chain-detect'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { LOCATION_SOURCES, formatLocationSource } from '@/lib/location-source'
import AccountSelect from '@/components/AccountSelect'
import StateSelect from '@/components/StateSelect'

const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']
const PROGRAMS = [
  { key: 'multi_drive', label: 'Multi-Drive' },
  { key: 'ev_program', label: 'EV Program' },
  { key: 'oem_warranty', label: 'OEM Warranty' },
]
const PROGRAM_STATUSES = ['not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated']

const KNOWN_CHAIN_SET = new Set<string>(KNOWN_CHAINS)

interface ShopFormProps {
  initial?: any
  locationId?: string
}

export default function ShopForm({ initial, locationId }: ShopFormProps) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    chain_name: initial?.chain_name ?? '',
    account_id: initial?.account_id ?? initial?.owner_id ?? null,
    address_line1: initial?.address_line1 ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    postal_code: initial?.postal_code ?? '',
    primary_contact_name: initial?.primary_contact_name ?? '',
    primary_contact_email: initial?.primary_contact_email ?? '',
    primary_contact_phone: initial?.primary_contact_phone ?? '',
    status: initial?.status ?? 'lead',
    assigned_to: normalizeBdrAssignedTo(initial?.assigned_to),
    source: initial?.source ?? '',
    notes: initial?.notes ?? '',
  })
  const [detectedChain, setDetectedChain] = useState<string | null>(null)
  const [programStatuses, setProgramStatuses] = useState<Record<string, string>>(
    Object.fromEntries(
      PROGRAMS.map(p => {
        const e = initial?.program_enrollments?.find((e: any) => e.program === p.key)
        return [p.key, e?.status ?? 'not_enrolled']
      })
    )
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !locationId
  const [accountChoice, setAccountChoice] = useState<'existing' | 'new'>('existing')
  const [newAccount, setNewAccount] = useState({
    name: '',
    email: '',
    phone: '',
  })
  const [primarySameAsAccount, setPrimarySameAsAccount] = useState(false)
  const [accountDetails, setAccountDetails] = useState<{
    business_name: string
    contactName: string
    email: string
    phone: string
  } | null>(null)
  const [accountFetchFailed, setAccountFetchFailed] = useState(false)

  useEffect(() => {
    if (!primarySameAsAccount || !form.account_id || (isNew && accountChoice === 'new')) {
      setAccountDetails(null)
      setAccountFetchFailed(false)
      return
    }
    setAccountFetchFailed(false)
    let cancel = false
    async function load() {
      try {
        const [accRes, conRes] = await Promise.all([
          fetch(`/api/accounts/${form.account_id}`),
          fetch(`/api/contacts?account_id=${encodeURIComponent(form.account_id!)}`),
        ])
        if (!accRes.ok) throw new Error('account')
        const acc = await accRes.json()
        const contacts = conRes.ok ? await conRes.json() : []
        if (cancel) return
        const list = Array.isArray(contacts) ? contacts : []
        const primary = list.find((c: { is_primary?: boolean }) => c.is_primary) ?? list[0]
        setAccountDetails({
          business_name: acc.business_name ?? '',
          contactName: primary?.name ?? acc.business_name ?? '',
          email: primary?.email ?? '',
          phone: primary?.phone ?? '',
        })
      } catch {
        if (!cancel) {
          setAccountDetails(null)
          setAccountFetchFailed(true)
        }
      }
    }
    void load()
    return () => {
      cancel = true
    }
  }, [primarySameAsAccount, form.account_id, isNew, accountChoice])

  useEffect(() => {
    if (!primarySameAsAccount) return
    if (isNew && accountChoice === 'new') {
      setForm(f => ({
        ...f,
        primary_contact_name: newAccount.name,
        primary_contact_email: newAccount.email,
        primary_contact_phone: newAccount.phone,
      }))
      return
    }
    if (!accountDetails) return
    setForm(f => ({
      ...f,
      primary_contact_name: accountDetails.contactName,
      primary_contact_email: accountDetails.email,
      primary_contact_phone: accountDetails.phone,
    }))
  }, [
    primarySameAsAccount,
    isNew,
    accountChoice,
    newAccount.name,
    newAccount.email,
    newAccount.phone,
    accountDetails,
  ])

  function f(name: string) {
    return {
      value: (form as any)[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    }
  }

  function handleNameBlur() {
    if (!form.name) return
    const chain = detectChain(form.name)
    if (chain && !form.chain_name) {
      setForm(f => ({ ...f, chain_name: chain }))
      setDetectedChain(chain)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isNew) {
        if (accountChoice === 'existing' && !form.account_id) {
          setError('Select an account from the list.')
          setSaving(false)
          return
        }
        if (accountChoice === 'new' && !newAccount.name.trim()) {
          setError('Account / primary contact name is required.')
          setSaving(false)
          return
        }
      }
      const url = locationId ? `/api/locations/${locationId}` : '/api/locations'
      const method = locationId ? 'PATCH' : 'POST'
      const payload: Record<string, unknown> = { ...form, programStatuses }
      if (isNew && accountChoice === 'new') {
        payload.account_id = null
        payload.newAccount = {
          name: newAccount.name.trim(),
          email: newAccount.email.trim() || undefined,
          phone: newAccount.phone.trim() || undefined,
        }
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      router.push(`/shops/${data.id ?? locationId}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-onix-800">Shop Info</h2>
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Shop Name *</label>
          <input
            {...f('name')}
            onBlur={handleNameBlur}
            required
            className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm"
          />
          {detectedChain && (
            <p className="text-xs text-orange-600 mt-1">
              Detected: {detectedChain}{' '}
              <button type="button" onClick={() => { setForm(f => ({ ...f, chain_name: '' })); setDetectedChain(null) }} className="underline">clear</button>
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Chain Name</label>
          <select
            value={form.chain_name}
            onChange={e => setForm(f => ({ ...f, chain_name: e.target.value }))}
            className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm bg-white"
          >
            <option value="">— None —</option>
            {KNOWN_CHAINS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            {form.chain_name && !KNOWN_CHAIN_SET.has(form.chain_name) && (
              <option value={form.chain_name}>{form.chain_name} (saved value)</option>
            )}
          </select>
          <p className="text-xs text-onix-600 mt-1">Optional. Shop name blur can auto-pick a chain when it matches.</p>
        </div>
        <div className="space-y-3">
          <span className="block text-xs font-medium text-onix-600">Account</span>
          {isNew ? (
            <>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="accountChoice"
                    checked={accountChoice === 'existing'}
                    onChange={() => {
                      setAccountChoice('existing')
                      setPrimarySameAsAccount(false)
                    }}
                    className="border-arctic-300"
                  />
                  Pick existing account
                </label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="accountChoice"
                    checked={accountChoice === 'new'}
                    onChange={() => {
                      setAccountChoice('new')
                      setForm(f => ({ ...f, account_id: null }))
                      setPrimarySameAsAccount(false)
                    }}
                    className="border-arctic-300"
                  />
                  Create new account
                </label>
              </div>
              {accountChoice === 'existing' ? (
                <AccountSelect
                  value={form.account_id}
                  onChange={accountId => setForm(f => ({ ...f, account_id: accountId }))}
                />
              ) : (
                <div className="space-y-3 border-l-2 border-arctic-200 ml-1.5 pl-4">
                  <div>
                    <label className="block text-xs font-medium text-onix-600 mb-1">
                      Business / account name * <span className="text-onix-400">(also used for primary contact)</span>
                    </label>
                    <input
                      value={newAccount.name}
                      onChange={e => setNewAccount(o => ({ ...o, name: e.target.value }))}
                      required={accountChoice === 'new'}
                      className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-onix-600 mb-1">Email</label>
                      <input
                        type="email"
                        value={newAccount.email}
                        onChange={e => setNewAccount(o => ({ ...o, email: e.target.value }))}
                        className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-onix-600 mb-1">Phone</label>
                      <input
                        value={newAccount.phone}
                        onChange={e => setNewAccount(o => ({ ...o, phone: e.target.value }))}
                        className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <AccountSelect
              value={form.account_id}
              onChange={accountId => setForm(f => ({ ...f, account_id: accountId }))}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-onix-800">Address</h2>
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Address Line 1</label>
          <input {...f('address_line1')} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">City</label>
            <input {...f('city')} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">State</label>
            <StateSelect
              value={form.state}
              onChange={state => setForm(f => ({ ...f, state }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Postal Code</label>
            <input {...f('postal_code')} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-onix-800">Primary Contact</h2>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={primarySameAsAccount}
            onChange={e => setPrimarySameAsAccount(e.target.checked)}
            className="rounded border-arctic-300"
          />
          Primary contact is same as account primary
        </label>
        {primarySameAsAccount &&
          form.account_id &&
          !(isNew && accountChoice === 'new') &&
          !accountDetails &&
          !accountFetchFailed && <p className="text-xs text-onix-600">Loading account…</p>}
        {primarySameAsAccount && accountFetchFailed && (
          <p className="text-xs text-red-600">Could not load account. Uncheck the box and enter primary contact manually.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Name</label>
            <input
              {...f('primary_contact_name')}
              disabled={primarySameAsAccount}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm disabled:bg-arctic-50 disabled:text-onix-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Phone</label>
            <input
              {...f('primary_contact_phone')}
              disabled={primarySameAsAccount}
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm disabled:bg-arctic-50 disabled:text-onix-800"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Email</label>
          <input
            {...f('primary_contact_email')}
            type="email"
            disabled={primarySameAsAccount}
            className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm disabled:bg-arctic-50 disabled:text-onix-800"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-onix-800">Shop progress</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Status</label>
            <select {...f('status')} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm">
              {STATUSES.map(s => <option key={s} value={s}>{LOCATION_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Assigned to</label>
            <select
              value={form.assigned_to}
              onChange={e =>
                setForm(f => ({ ...f, assigned_to: normalizeBdrAssignedTo(e.target.value) }))
              }
              className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm bg-white"
            >
              {BDR_ASSIGNEES.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-onix-600 mb-1">Source</label>
            <select {...f('source')} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm">
              <option value="">—</option>
              {LOCATION_SOURCES.map(s => (
                <option key={s} value={s}>
                  {formatLocationSource(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-onix-800">Programs</h2>
        {PROGRAMS.map(p => (
          <div key={p.key} className="flex items-center gap-3">
            <span className="text-sm w-28">{p.label}</span>
            <select
              value={programStatuses[p.key]}
              onChange={e => setProgramStatuses(ps => ({ ...ps, [p.key]: e.target.value }))}
              className="border border-arctic-300 rounded px-2 py-1 text-sm"
            >
              {PROGRAM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        ))}
      </section>

      <div>
        <label className="block text-xs font-medium text-onix-600 mb-1">Notes</label>
        <textarea {...f('notes')} rows={3} className="w-full border border-arctic-300 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : locationId ? 'Save Changes' : 'Add Shop'}
        </button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm text-onix-600 hover:bg-arctic-100 rounded">
          Cancel
        </button>
      </div>
    </form>
  )
}
