'use client'

import { useState } from 'react'
import StateSelect from '@/components/StateSelect'

const PROGRAMS = [
  { key: 'multi_drive', label: 'Multi-Drive' },
  { key: 'ev_program', label: 'EV Program' },
  { key: 'oem_warranty', label: 'OEM Warranty' },
]

const STATUS_LABELS: Record<string, string> = {
  not_enrolled: 'Not enrolled',
  pending_activation: 'Pending activation',
  active: 'Active',
  suspended: 'Suspended',
  terminated: 'Terminated',
}

export default function PortalForm({ location, token }: { location: any; token: string }) {
  const [form, setForm] = useState({
    address_line1: location.address_line1 ?? '',
    city: location.city ?? '',
    state: location.state ?? '',
    postal_code: location.postal_code ?? '',
    primary_contact_name: location.primary_contact_name ?? '',
    primary_contact_email: location.primary_contact_email ?? '',
    primary_contact_phone: location.primary_contact_phone ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  function f(name: keyof typeof form) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/portal/${token}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setConfirmed(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (confirmed) {
    return (
      <div className="text-center py-8">
        <div className="text-green-600 text-4xl mb-3">✓</div>
        <h2 className="text-lg font-semibold">Information confirmed</h2>
        <p className="text-sm text-gray-500 mt-1">Thank you, {location.name}. We've received your updated information.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-0.5">Shop Name</label>
        <p className="text-sm font-medium">{location.name}</p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Address</h3>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 1</label>
          <input {...f('address_line1')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input {...f('city')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
            <StateSelect
              value={form.state}
              onChange={state => setForm(f => ({ ...f, state }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Zip</label>
            <input {...f('postal_code')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Contact Info</h3>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input {...f('primary_contact_name')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
          <input {...f('primary_contact_email')} type="email" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
          <input {...f('primary_contact_phone')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Program Enrollments</h3>
        <div className="space-y-1">
          {PROGRAMS.map(p => {
            const e = location.program_enrollments?.find((e: any) => e.program === p.key)
            return (
              <div key={p.key} className="flex justify-between text-sm">
                <span className="text-gray-600">{p.label}</span>
                <span className="text-gray-400">{STATUS_LABELS[e?.status ?? 'not_enrolled']}</span>
              </div>
            )
          })}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Confirm Info is Correct'}
      </button>
    </div>
  )
}
