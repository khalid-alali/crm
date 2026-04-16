'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { detectChain, KNOWN_CHAINS } from '@/lib/chain-detect'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import OwnerSelect from '@/components/OwnerSelect'
import StateSelect from '@/components/StateSelect'

const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']
const SOURCES = ['cold_call', 'referral', 'inbound', 'event', 'import', 'other']
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
    owner_id: initial?.owner_id ?? null,
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
  const [ownerChoice, setOwnerChoice] = useState<'existing' | 'new'>('existing')
  const [newOwner, setNewOwner] = useState({
    name: '',
    email: '',
    phone: '',
    title: '',
  })
  const [primarySameAsOwner, setPrimarySameAsOwner] = useState(false)
  const [ownerDetails, setOwnerDetails] = useState<{
    name: string
    email: string
    phone: string
  } | null>(null)
  const [ownerFetchFailed, setOwnerFetchFailed] = useState(false)

  useEffect(() => {
    if (!primarySameAsOwner || !form.owner_id || (isNew && ownerChoice === 'new')) {
      setOwnerDetails(null)
      setOwnerFetchFailed(false)
      return
    }
    setOwnerFetchFailed(false)
    let cancel = false
    fetch(`/api/owners/${form.owner_id}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { name: string; email: string | null; phone: string | null }) => {
        if (cancel) return
        setOwnerDetails({
          name: data.name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
        })
      })
      .catch(() => {
        if (!cancel) {
          setOwnerDetails(null)
          setOwnerFetchFailed(true)
        }
      })
    return () => {
      cancel = true
    }
  }, [primarySameAsOwner, form.owner_id, isNew, ownerChoice])

  useEffect(() => {
    if (!primarySameAsOwner) return
    if (isNew && ownerChoice === 'new') {
      setForm(f => ({
        ...f,
        primary_contact_name: newOwner.name,
        primary_contact_email: newOwner.email,
        primary_contact_phone: newOwner.phone,
      }))
      return
    }
    if (!ownerDetails) return
    setForm(f => ({
      ...f,
      primary_contact_name: ownerDetails.name,
      primary_contact_email: ownerDetails.email,
      primary_contact_phone: ownerDetails.phone,
    }))
  }, [
    primarySameAsOwner,
    isNew,
    ownerChoice,
    newOwner.name,
    newOwner.email,
    newOwner.phone,
    ownerDetails,
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
        if (ownerChoice === 'existing' && !form.owner_id) {
          setError('Select an owner from the list.')
          setSaving(false)
          return
        }
        if (ownerChoice === 'new' && !newOwner.name.trim()) {
          setError('New owner name is required.')
          setSaving(false)
          return
        }
      }
      const url = locationId ? `/api/locations/${locationId}` : '/api/locations'
      const method = locationId ? 'PATCH' : 'POST'
      const payload: Record<string, unknown> = { ...form, programStatuses }
      if (isNew && ownerChoice === 'new') {
        payload.owner_id = null
        payload.newOwner = {
          name: newOwner.name.trim(),
          email: newOwner.email.trim() || undefined,
          phone: newOwner.phone.trim() || undefined,
          title: newOwner.title.trim() || undefined,
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
        <h2 className="text-sm font-semibold text-gray-700">Shop Info</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Shop Name *</label>
          <input
            {...f('name')}
            onBlur={handleNameBlur}
            required
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          {detectedChain && (
            <p className="text-xs text-orange-600 mt-1">
              Detected: {detectedChain}{' '}
              <button type="button" onClick={() => { setForm(f => ({ ...f, chain_name: '' })); setDetectedChain(null) }} className="underline">clear</button>
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Chain Name</label>
          <select
            value={form.chain_name}
            onChange={e => setForm(f => ({ ...f, chain_name: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
          >
            <option value="">— None —</option>
            {KNOWN_CHAINS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            {form.chain_name && !KNOWN_CHAIN_SET.has(form.chain_name) && (
              <option value={form.chain_name}>{form.chain_name} (saved value)</option>
            )}
          </select>
          <p className="text-xs text-gray-500 mt-1">Optional. Shop name blur can auto-pick a chain when it matches.</p>
        </div>
        <div className="space-y-3">
          <span className="block text-xs font-medium text-gray-600">Owner</span>
          {isNew ? (
            <>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="ownerChoice"
                    checked={ownerChoice === 'existing'}
                    onChange={() => {
                      setOwnerChoice('existing')
                      setPrimarySameAsOwner(false)
                    }}
                    className="border-gray-300"
                  />
                  Pick existing owner
                </label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="ownerChoice"
                    checked={ownerChoice === 'new'}
                    onChange={() => {
                      setOwnerChoice('new')
                      setForm(f => ({ ...f, owner_id: null }))
                      setPrimarySameAsOwner(false)
                    }}
                    className="border-gray-300"
                  />
                  Create new owner
                </label>
              </div>
              {ownerChoice === 'existing' ? (
                <OwnerSelect
                  value={form.owner_id}
                  onChange={ownerId => setForm(f => ({ ...f, owner_id: ownerId }))}
                />
              ) : (
                <div className="space-y-3 border-l-2 border-gray-200 ml-1.5 pl-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Owner name *</label>
                    <input
                      value={newOwner.name}
                      onChange={e => setNewOwner(o => ({ ...o, name: e.target.value }))}
                      required={ownerChoice === 'new'}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                      <input
                        type="email"
                        value={newOwner.email}
                        onChange={e => setNewOwner(o => ({ ...o, email: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                      <input
                        value={newOwner.phone}
                        onChange={e => setNewOwner(o => ({ ...o, phone: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                    <input
                      value={newOwner.title}
                      onChange={e => setNewOwner(o => ({ ...o, title: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      placeholder="e.g. Owner, GM"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <OwnerSelect
              value={form.owner_id}
              onChange={ownerId => setForm(f => ({ ...f, owner_id: ownerId }))}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Address</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1</label>
          <input {...f('address_line1')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input {...f('city')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <StateSelect
              value={form.state}
              onChange={state => setForm(f => ({ ...f, state }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Postal Code</label>
            <input {...f('postal_code')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Primary Contact</h2>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={primarySameAsOwner}
            onChange={e => setPrimarySameAsOwner(e.target.checked)}
            className="rounded border-gray-300"
          />
          Primary contact is same as owner info
        </label>
        {primarySameAsOwner &&
          form.owner_id &&
          !(isNew && ownerChoice === 'new') &&
          !ownerDetails &&
          !ownerFetchFailed && <p className="text-xs text-gray-500">Loading owner…</p>}
        {primarySameAsOwner && ownerFetchFailed && (
          <p className="text-xs text-red-600">Could not load owner. Uncheck the box and enter primary contact manually.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              {...f('primary_contact_name')}
              disabled={primarySameAsOwner}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input
              {...f('primary_contact_phone')}
              disabled={primarySameAsOwner}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-700"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            {...f('primary_contact_email')}
            type="email"
            disabled={primarySameAsOwner}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-700"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Shop progress</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select {...f('status')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
              {STATUSES.map(s => <option key={s} value={s}>{LOCATION_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned to</label>
            <select
              value={form.assigned_to}
              onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
            >
              {BDR_ASSIGNEES.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
            <select {...f('source')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Programs</h2>
        {PROGRAMS.map(p => (
          <div key={p.key} className="flex items-center gap-3">
            <span className="text-sm w-28">{p.label}</span>
            <select
              value={programStatuses[p.key]}
              onChange={e => setProgramStatuses(ps => ({ ...ps, [p.key]: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {PROGRAM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        ))}
      </section>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea {...f('notes')} rows={3} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : locationId ? 'Save Changes' : 'Add Shop'}
        </button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
          Cancel
        </button>
      </div>
    </form>
  )
}
