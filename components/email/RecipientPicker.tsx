'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Check, X } from 'lucide-react'
import { CONTACT_ROLE_LABELS, isContactRole, type ContactRole } from '@/lib/contact-roles'
import { EMAIL_RE } from '@/lib/email-recipients'

export type RecipientContact = {
  id: string
  name: string | null
  email: string
  role: string
  scope: 'location' | 'account'
  isPrimary: boolean
}

export type RecipientPickerProps = {
  label: 'To' | 'Cc'
  value: string[]
  onChange: (emails: string[]) => void
  contacts: RecipientContact[]
  shopName: string
  accountName: string | null
  required?: boolean
  excludeEmails?: string[]
  primaryEmail?: string | null
  placeholder?: string
}

export type RecipientPickerHandle = {
  focus: () => void
}

function roleLabel(role: string): string {
  return isContactRole(role) ? CONTACT_ROLE_LABELS[role as ContactRole] : role
}

function initials(name: string | null, email: string): string {
  const n = name?.trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

const RecipientPicker = forwardRef<RecipientPickerHandle, RecipientPickerProps>(function RecipientPicker(
  {
    label,
    value,
    onChange,
    contacts,
    shopName,
    accountName,
    required: _required,
    excludeEmails = [],
    primaryEmail,
    placeholder = 'Add recipient',
  },
  ref,
) {
  const excludeSet = useMemo(() => new Set(excludeEmails.map(normalizeEmail)), [excludeEmails])
  const valueSet = useMemo(() => new Set(value.map(normalizeEmail)), [value])
  const primaryNorm = primaryEmail ? normalizeEmail(primaryEmail) : null

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const locationContacts = useMemo(
    () => contacts.filter(c => c.scope === 'location' && !excludeSet.has(normalizeEmail(c.email))),
    [contacts, excludeSet],
  )
  const accountContacts = useMemo(
    () => contacts.filter(c => c.scope === 'account' && !excludeSet.has(normalizeEmail(c.email))),
    [contacts, excludeSet],
  )

  const q = query.trim().toLowerCase()
  const filterRow = useCallback(
    (c: RecipientContact) => {
      if (!q) return true
      const name = (c.name ?? '').toLowerCase()
      const email = c.email.toLowerCase()
      const rl = roleLabel(c.role).toLowerCase()
      return name.includes(q) || email.includes(q) || rl.includes(q)
    },
    [q],
  )

  const locFiltered = useMemo(() => locationContacts.filter(filterRow), [locationContacts, filterRow])
  const accFiltered = useMemo(() => accountContacts.filter(filterRow), [accountContacts, filterRow])

  const typedEmail = query.trim()
  const typedNorm = typedEmail ? normalizeEmail(typedEmail) : ''
  const contactEmailsMatch = useMemo(() => {
    const all = [...locFiltered, ...accFiltered]
    return new Set(all.map(c => normalizeEmail(c.email)))
  }, [locFiltered, accFiltered])

  const showAddRow =
    typedNorm.length > 0 &&
    EMAIL_RE.test(typedNorm) &&
    !contactEmailsMatch.has(typedNorm) &&
    !valueSet.has(typedNorm) &&
    !excludeSet.has(typedNorm)

  type MenuRow =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'contact'; key: string; c: RecipientContact }
    | { kind: 'add'; key: string; email: string }

  const menuRows: MenuRow[] = useMemo(() => {
    const rows: MenuRow[] = []
    if (locFiltered.length > 0) {
      rows.push({ kind: 'header', key: 'h-loc', title: `Location · ${shopName}` })
      for (const c of locFiltered) rows.push({ kind: 'contact', key: c.id, c })
    }
    if (accFiltered.length > 0) {
      rows.push({
        kind: 'header',
        key: 'h-acc',
        title: `Account · ${accountName?.trim() || 'Account'}`,
      })
      for (const c of accFiltered) rows.push({ kind: 'contact', key: c.id, c })
    }
    if (showAddRow) rows.push({ kind: 'add', key: 'add', email: typedNorm })
    if (rows.length === 0 && q && !showAddRow) {
      rows.push({ kind: 'header', key: 'empty', title: `No contacts match "${query.trim()}"` })
    }
    return rows
  }, [locFiltered, accFiltered, shopName, accountName, showAddRow, typedNorm, q, query])

  const selectableIndices = useMemo(
    () => menuRows.map((r, i) => (r.kind === 'contact' || r.kind === 'add' ? i : -1)).filter(i => i >= 0),
    [menuRows],
  )

  useEffect(() => {
    if (!open) return
    setHighlight(selectableIndices[0] ?? 0)
  }, [open, selectableIndices, menuRows])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function addEmail(email: string) {
    const norm = normalizeEmail(email)
    if (!EMAIL_RE.test(norm) || excludeSet.has(norm) || valueSet.has(norm)) return
    onChange([...value, norm])
    setQuery('')
    setOpen(true)
  }

  function removeEmail(email: string) {
    const norm = normalizeEmail(email)
    onChange(value.filter(e => normalizeEmail(e) !== norm))
  }

  function toggleContact(c: RecipientContact) {
    const norm = normalizeEmail(c.email)
    if (valueSet.has(norm)) {
      removeEmail(c.email)
      return
    }
    if (excludeSet.has(norm)) return
    addEmail(c.email)
  }

  function moveHighlight(delta: number) {
    if (selectableIndices.length === 0) return
    const cur = selectableIndices.indexOf(highlight)
    const next = cur < 0 ? 0 : (cur + delta + selectableIndices.length) % selectableIndices.length
    setHighlight(selectableIndices[next]!)
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else moveHighlight(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (open) moveHighlight(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = menuRows[highlight]
      if (row?.kind === 'contact') toggleContact(row.c)
      else if (row?.kind === 'add') addEmail(row.email)
      else if (showAddRow && EMAIL_RE.test(typedNorm)) addEmail(typedNorm)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      removeEmail(value[value.length - 1]!)
    }
  }

  function contactForChip(email: string): RecipientContact | undefined {
    const norm = normalizeEmail(email)
    return contacts.find(c => normalizeEmail(c.email) === norm)
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-onix-600">
        {label}
        {_required ? <span className="text-red-600"> *</span> : null}
      </label>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 ${
          open ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-arctic-300'
        }`}
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest('button[data-chip-remove]')) return
          inputRef.current?.focus()
          setOpen(true)
        }}
      >
        {value.map(email => {
          const c = contactForChip(email)
          const isPrimary = primaryNorm && normalizeEmail(email) === primaryNorm
          const isAdhoc = !c
          const chipClass = isPrimary
            ? 'border-brand-200 bg-brand-50'
            : isAdhoc
              ? 'border-amber-200 bg-amber-50'
              : 'border-arctic-200 bg-arctic-50'
          return (
            <span
              key={email}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2 pr-0.5 text-xs ${chipClass}`}
            >
              {isPrimary ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" title="Primary contact" />
              ) : null}
              <span className="min-w-0 font-medium text-onix-900">
                {c?.name?.trim() || email}
                {c?.name?.trim() ? (
                  <span className="font-normal text-onix-500"> · {email}</span>
                ) : null}
              </span>
              <button
                type="button"
                data-chip-remove
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-onix-500 hover:bg-black/5 hover:text-onix-800"
                aria-label={`Remove ${email}`}
                onClick={e => {
                  e.stopPropagation()
                  removeEmail(email)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          aria-autocomplete="list"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 border-0 bg-transparent py-0.5 text-sm text-onix-900 outline-none placeholder:text-onix-400"
        />
      </div>

      {open && menuRows.length > 0 ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-arctic-200 bg-white shadow-lg"
          role="listbox"
        >
          {menuRows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={row.key}
                  className="sticky top-0 bg-arctic-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-onix-400"
                >
                  {row.title}
                </div>
              )
            }
            if (row.kind === 'add') {
              const hi = i === highlight
              return (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  className={`flex w-full items-center gap-2 border-t border-arctic-100 px-3 py-2.5 text-left text-sm hover:bg-arctic-50 ${
                    hi ? 'bg-brand-50' : 'bg-arctic-50/80'
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addEmail(row.email)}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-arctic-300 text-onix-500">
                    +
                  </span>
                  <span className="min-w-0 text-onix-800">
                    Add <strong>{row.email}</strong> as a one-time recipient
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-onix-400">Enter</span>
                </button>
              )
            }
            const { c } = row
            const selected = valueSet.has(normalizeEmail(c.email))
            const hi = i === highlight
            return (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-arctic-50 ${
                  hi ? 'bg-brand-50/60' : ''
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggleContact(c)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-arctic-100 text-[11px] font-semibold text-onix-600">
                  {initials(c.name, c.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-medium text-onix-900">{c.name?.trim() || c.email}</span>
                    {c.name?.trim() ? (
                      <span className="text-xs text-onix-500">· {roleLabel(c.role)}</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-onix-500">{c.email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.isPrimary && primaryNorm && normalizeEmail(c.email) === primaryNorm ? (
                    <span className="rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                      Primary
                    </span>
                  ) : null}
                  {selected ? <Check className="h-4 w-4 text-brand-600" aria-hidden /> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})

export default RecipientPicker
