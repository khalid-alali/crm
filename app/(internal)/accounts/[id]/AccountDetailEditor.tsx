'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

interface Account {
  id: string
  business_name: string
  notes: string | null
}

function formFromAccount(account: Account) {
  return {
    business_name: account.business_name ?? '',
    notes: account.notes ?? '',
  }
}

export default function AccountDetailEditor({ account }: { account: Account }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => formFromAccount(account))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editing) return
    setForm(formFromAccount(account))
  }, [account, editing])

  function f(name: keyof typeof form) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    }
  }

  function startEdit() {
    setError('')
    setForm(formFromAccount(account))
    setEditing(true)
  }

  function cancelEdit() {
    setForm(formFromAccount(account))
    setEditing(false)
    setError('')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditing(false)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-onix-400">Account</div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-onix-400 hover:bg-arctic-100 hover:text-onix-700"
            aria-label="Edit account"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-onix-400">Business name</label>
            <input {...f('business_name')} className="w-full rounded border border-arctic-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-onix-400">Notes</label>
            <textarea {...f('notes')} rows={3} className="w-full rounded border border-arctic-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="rounded border border-arctic-300 px-3 py-1.5 text-xs font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-onix-400">Business name</div>
            <div className="mt-0.5 text-sm font-medium text-onix-950">{account.business_name?.trim() || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-onix-400">Notes</div>
            <div className="mt-0.5 whitespace-pre-wrap text-sm text-onix-800">{account.notes?.trim() ? account.notes : '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
