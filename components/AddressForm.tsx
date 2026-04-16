'use client'

import { useState } from 'react'
import StateSelect from '@/components/StateSelect'

interface AddressData {
  address_line1: string
  city: string
  state: string
  postal_code: string
}

interface Props {
  initial: AddressData
  locationId: string
  onSaved: (address: AddressData & { lat?: number; lng?: number }) => void
}

export default function AddressForm({ initial, locationId, onSaved }: Props) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function field(name: keyof AddressData) {
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
      const res = await fetch(`/api/locations/${locationId}/address`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      onSaved({ ...form, lat: data.lat, lng: data.lng })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1</label>
        <input {...field('address_line1')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
          <input {...field('city')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
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
          <input {...field('postal_code')} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Address'}
      </button>
    </div>
  )
}
