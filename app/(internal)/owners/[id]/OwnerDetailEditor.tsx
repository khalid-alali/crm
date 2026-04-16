'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Owner {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  notes: string | null
}

export default function OwnerDetailEditor({ owner }: { owner: Owner }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: owner.name,
    email: owner.email ?? '',
    phone: owner.phone ?? '',
    title: owner.title ?? '',
    notes: owner.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function f(name: keyof typeof form) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/owners/${owner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-600">Owner Details</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(['name', 'email', 'phone', 'title'] as const).map(field => (
        <div key={field}>
          <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{field}</label>
          <input {...f(field)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
        </div>
      ))}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <textarea {...f('notes')} rows={3} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
