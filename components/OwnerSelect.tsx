'use client'

import { useState, useEffect, useRef } from 'react'

interface Owner {
  id: string
  name: string
  email: string | null
}

interface Props {
  value: string | null
  onChange: (ownerId: string | null) => void
}

export default function OwnerSelect({ value, onChange }: Props) {
  const [owners, setOwners] = useState<Owner[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/owners/search?q=' + encodeURIComponent(search))
      .then(r => r.json())
      .then(setOwners)
      .catch(() => {})
  }, [search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = owners.find(o => o.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selected ? selected.name : <span className="text-gray-400">Select owner…</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-auto">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search owners…"
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {owners.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            >
              <div>{o.name}</div>
              {o.email && <div className="text-xs text-gray-400">{o.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
