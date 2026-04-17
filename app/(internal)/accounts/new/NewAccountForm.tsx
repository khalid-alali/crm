'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewAccountForm() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = businessName.trim()
    if (!name) {
      setError('Business / account name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: name,
          notes: notes.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create account')
      if (!data.id) throw new Error('Invalid response')
      router.push(`/accounts/${data.id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label
          htmlFor="new-account-business-name"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-onix-400"
        >
          Business / account name
        </label>
        <input
          id="new-account-business-name"
          type="text"
          value={businessName}
          onChange={e => setBusinessName(e.target.value)}
          autoComplete="organization"
          className="w-full rounded border border-arctic-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label
          htmlFor="new-account-notes"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-onix-400"
        >
          Notes <span className="font-normal text-onix-500">(optional)</span>
        </label>
        <textarea
          id="new-account-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-arctic-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/accounts')}
          disabled={saving}
          className="rounded border border-arctic-300 px-3 py-1.5 text-sm font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
