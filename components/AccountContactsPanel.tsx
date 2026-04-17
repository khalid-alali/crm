'use client'

import { useCallback, useEffect, useState } from 'react'
import { CONTACT_ROLE_LABELS, CONTACT_ROLES, type ContactRole } from '@/lib/contact-roles'
import { crmInputNoAutofillProps, crmSelectNoAutofillProps } from '@/lib/crm-no-autofill'
import SimpleModal from '@/components/SimpleModal'
import { Pencil, Plus, Trash2 } from 'lucide-react'

type Contact = {
  id: string
  account_id: string | null
  location_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  role: string
  is_primary: boolean
  created_at: string
}

export default function AccountContactsPanel({
  accountId,
  locations,
  missingBusinessName,
}: {
  accountId: string
  locations: { id: string; name: string }[]
  missingBusinessName?: boolean
}) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'owner' as ContactRole,
    location_id: '' as string,
    is_primary: false,
  })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts?account_id=${encodeURIComponent(accountId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setContacts(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void load()
  }, [load])

  const byRole = (role: ContactRole) => contacts.filter(c => c.role === role)

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setError(null)
    setSaving(false)
  }

  function openAdd() {
    setError(null)
    setForm({ name: '', email: '', phone: '', role: 'owner', location_id: '', is_primary: false })
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(c: Contact) {
    setError(null)
    setEditingId(c.id)
    setForm({
      name: c.name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      role: (CONTACT_ROLES.includes(c.role as ContactRole) ? c.role : 'other') as ContactRole,
      location_id: c.location_id ?? '',
      is_primary: c.is_primary,
    })
    setModalOpen(true)
  }

  async function submitCreate() {
    setError(null)
    setSaving(true)
    try {
      const location_id = form.location_id.trim() || null
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          location_id,
          name: form.name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          is_primary: form.is_primary,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Save failed')
        return
      }
      await load()
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  async function submitEdit() {
    if (!editingId) return
    setError(null)
    setSaving(true)
    try {
      const location_id = form.location_id.trim() || null
      const res = await fetch(`/api/contacts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id,
          name: form.name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          is_primary: form.is_primary,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Save failed')
        return
      }
      await load()
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this contact?')) return
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Delete failed')
      return
    }
    await load()
  }

  function renderCard(c: Contact) {
    const loc = c.location_id ? locations.find(l => l.id === c.location_id) : null
    const needsNameReview = !c.name?.trim() && !!c.email?.trim()
    const r = CONTACT_ROLES.includes(c.role as ContactRole) ? (c.role as ContactRole) : 'other'

    return (
      <div key={c.id} className="rounded-lg border border-arctic-200 bg-white px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-onix-900">{c.name?.trim() || c.email || '—'}</span>
              <span className="rounded bg-arctic-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-onix-600">
                {CONTACT_ROLE_LABELS[r]}
              </span>
              {c.is_primary && (
                <span className="text-[10px] font-medium uppercase text-brand-600">Primary</span>
              )}
            </div>
            {loc && <div className="mt-0.5 text-xs text-onix-500">Location: {loc.name}</div>}
            {needsNameReview && (
              <div className="mt-1 text-[10px] font-medium text-amber-700">Review: no display name (email only)</div>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="mt-1 block truncate text-xs text-brand-700 hover:underline">
                {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="mt-0.5 block text-xs text-brand-700 hover:underline">
                {c.phone}
              </a>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => openEdit(c)}
              className="rounded p-1 text-onix-400 hover:bg-arctic-100 hover:text-onix-700"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => remove(c.id)}
              className="rounded p-1 text-onix-400 hover:bg-red-50 hover:text-red-700"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderFormBody(onSubmit: () => void) {
    return (
      <form autoComplete="off" onSubmit={e => e.preventDefault()} className="space-y-3 text-sm">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium uppercase text-onix-500">Name</label>
            <input
              {...crmInputNoAutofillProps}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-onix-500">Phone</label>
            <input
              {...crmInputNoAutofillProps}
              type="text"
              inputMode="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-onix-500">Email</label>
            <input
              {...crmInputNoAutofillProps}
              type="text"
              inputMode="email"
              spellCheck={false}
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-onix-500">Role</label>
            <select
              {...crmSelectNoAutofillProps}
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as ContactRole }))}
              className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-sm"
            >
              {CONTACT_ROLES.map(r => (
                <option key={r} value={r}>
                  {CONTACT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase text-onix-500">Scope</label>
            <select
              {...crmSelectNoAutofillProps}
              value={form.location_id}
              onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
              className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-sm"
            >
              <option value="">All locations</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-onix-700">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
          />
          Primary contact for this account
        </label>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="rounded border border-arctic-300 px-3 py-1.5 text-xs hover:bg-arctic-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-xl border border-arctic-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-arctic-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-onix-800">Contacts</h2>
        {!modalOpen && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </button>
        )}
      </div>
      <div className="space-y-4 p-4">
        {missingBusinessName && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            Business name is missing — add one under Account.
          </p>
        )}
        {loading ? (
          <p className="text-xs text-onix-500">Loading…</p>
        ) : (
          CONTACT_ROLES.map(role => {
            const list = byRole(role)
            if (list.length === 0) return null
            return (
              <div key={role}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-onix-400">
                  {CONTACT_ROLE_LABELS[role]}
                </div>
                <div className="space-y-2">{list.map(renderCard)}</div>
              </div>
            )
          })
        )}
        {!loading && contacts.length === 0 && !modalOpen && (
          <p className="text-sm text-onix-400">No contacts yet.</p>
        )}
      </div>

      {modalOpen && (
        <SimpleModal
          title={editingId ? 'Edit Contact' : 'Add Contact'}
          titleId="account-contact-modal-title"
          onClose={closeModal}
          preventClose={saving}
        >
          {renderFormBody(() => void (editingId ? submitEdit() : submitCreate()))}
        </SimpleModal>
      )}
    </div>
  )
}
