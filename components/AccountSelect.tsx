'use client'

import { useState, useEffect, useRef } from 'react'

interface AccountOption {
  id: string
  business_name: string
}

interface Props {
  value: string | null
  onChange: (accountId: string | null) => void
}

export default function AccountSelect({ value, onChange }: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/accounts/search?q=' + encodeURIComponent(search))
      .then(r => r.json())
      .then(setAccounts)
      .catch(() => {})
  }, [search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!value) {
      setSelectedAccount(null)
      return
    }
    fetch(`/api/accounts/${value}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((a: { id: string; business_name: string }) =>
        setSelectedAccount({ id: a.id, business_name: a.business_name ?? '—' }),
      )
      .catch(() => setSelectedAccount(null))
  }, [value])

  const selected = accounts.find(o => o.id === value)
  const selectedLabel = selected?.business_name ?? selectedAccount?.business_name ?? null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left border border-arctic-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {selectedLabel ? selectedLabel : <span className="text-onix-400">Select account…</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-arctic-200 rounded shadow-lg max-h-60 overflow-auto">
          <div className="p-2 border-b border-arctic-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts…"
              className="w-full border border-arctic-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          {accounts.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-arctic-50"
            >
              <div>{o.business_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
