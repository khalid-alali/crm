'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { CreateTaskInput, ProgramContext, Task, TaskWithLocation } from '@/lib/types/task'

type PickerRow = {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
}

type PickedShop = {
  id: string
  name: string
  city: string | null
  state: string | null
}

interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (task: Task) => void
  defaultLocationId?: string
  defaultLocationLabel?: string
  /** City/state for locked shop row (shop detail / pre-filled context). */
  defaultLocationCity?: string | null
  defaultLocationState?: string | null
  defaultProgramContext?: ProgramContext
  taskToEdit?: TaskWithLocation
}

const PROGRAM_OPTIONS: Array<{ value: ProgramContext; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'vinfast', label: 'VinFast' },
  { value: 'tesla', label: 'Tesla' },
  { value: 'multidrive', label: 'Multidrive' },
]

type DueDateChoice = 'today' | 'tomorrow' | 'next_week' | 'custom' | 'none'

function dateOnlyFromNow(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function choiceFromDueDate(dueDate: string | null): DueDateChoice {
  if (!dueDate) return 'none'
  if (dueDate === dateOnlyFromNow(0)) return 'today'
  if (dueDate === dateOnlyFromNow(1)) return 'tomorrow'
  if (dueDate === dateOnlyFromNow(7)) return 'next_week'
  return 'custom'
}

function cityStateLine(city: string | null | undefined, state: string | null | undefined): string | null {
  const parts = [city, state].filter(p => p != null && String(p).trim() !== '')
  return parts.length ? parts.map(p => String(p).trim()).join(', ') : null
}

function LockedShopRow({
  name,
  cityLine,
  showClear,
  onClear,
}: {
  name: string
  cityLine: string | null
  showClear: boolean
  onClear?: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-arctic-200 bg-amber-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-onix-950">{name}</div>
        {cityLine ? <div className="mt-0.5 text-sm text-onix-500">{cityLine}</div> : null}
      </div>
      {showClear ? (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded p-1 text-onix-500 hover:bg-amber-100 hover:text-onix-900"
          aria-label="Clear shop selection"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

export default function TaskFormModal({
  open,
  onClose,
  onSuccess,
  defaultLocationId,
  defaultLocationLabel,
  defaultLocationCity,
  defaultLocationState,
  defaultProgramContext,
  taskToEdit,
}: TaskFormModalProps) {
  const isEdit = Boolean(taskToEdit)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueChoice, setDueChoice] = useState<DueDateChoice>('none')
  const [customDueDate, setCustomDueDate] = useState('')
  const [programContext, setProgramContext] = useState<ProgramContext>('general')
  const [locationId, setLocationId] = useState(defaultLocationId ?? '')
  const [pickedShop, setPickedShop] = useState<PickedShop | null>(null)
  const [shopQuery, setShopQuery] = useState('')
  const [debouncedShopQuery, setDebouncedShopQuery] = useState('')
  const [shopResults, setShopResults] = useState<PickerRow[]>([])
  const [shopLoading, setShopLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shopInputRef = useRef<HTMLInputElement>(null)
  const shopFieldRef = useRef<HTMLDivElement>(null)

  const locationLocked = Boolean(defaultLocationId || isEdit)

  const lockedShopName = useMemo(() => {
    if (isEdit && taskToEdit?.location?.name) return taskToEdit.location.name
    return defaultLocationLabel ?? ''
  }, [isEdit, taskToEdit?.location?.name, defaultLocationLabel])

  const lockedShopCityLine = useMemo(() => {
    if (isEdit && taskToEdit?.location) {
      return cityStateLine(taskToEdit.location.city, taskToEdit.location.state)
    }
    return cityStateLine(defaultLocationCity, defaultLocationState)
  }, [isEdit, taskToEdit?.location, defaultLocationCity, defaultLocationState])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setDebouncedShopQuery(shopQuery.trim()), 200)
    return () => clearTimeout(t)
  }, [open, shopQuery])

  useEffect(() => {
    if (!open) return
    if (taskToEdit) {
      setTitle(taskToEdit.title)
      setDescription(taskToEdit.description ?? '')
      setDueChoice(choiceFromDueDate(taskToEdit.due_date))
      setCustomDueDate(taskToEdit.due_date ?? '')
      setProgramContext(taskToEdit.program_context ?? 'general')
      setLocationId(taskToEdit.location_id)
    } else {
      setTitle('')
      setDescription('')
      setDueChoice('none')
      setCustomDueDate('')
      setProgramContext(defaultProgramContext ?? 'general')
      setLocationId(defaultLocationId ?? '')
    }
    setPickedShop(null)
    setShopQuery('')
    setDebouncedShopQuery('')
    setShopResults([])
    setDropdownOpen(false)
    setHighlightedIndex(-1)
    setError(null)
  }, [open, taskToEdit, defaultLocationId, defaultProgramContext])

  useEffect(() => {
    if (!open || locationLocked || pickedShop) {
      setShopResults([])
      setShopLoading(false)
      return
    }
    if (debouncedShopQuery.length < 2) {
      setShopResults([])
      setShopLoading(false)
      setDropdownOpen(false)
      setHighlightedIndex(-1)
      return
    }

    let cancelled = false
    setShopLoading(true)
    setHighlightedIndex(-1)

    void (async () => {
      try {
        const res = await fetch(`/api/locations/picker-search?q=${encodeURIComponent(debouncedShopQuery)}`)
        const data = (await res.json().catch(() => ({}))) as { results?: PickerRow[]; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setShopResults([])
          return
        }
        setShopResults(Array.isArray(data.results) ? data.results : [])
        setDropdownOpen(true)
      } catch {
        if (!cancelled) setShopResults([])
      } finally {
        if (!cancelled) setShopLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, locationLocked, pickedShop, debouncedShopQuery])

  useEffect(() => {
    if (!dropdownOpen || !shopFieldRef.current) return
    function onDocMouseDown(e: MouseEvent) {
      if (shopFieldRef.current && !shopFieldRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [dropdownOpen])

  const selectShop = useCallback((row: PickerRow) => {
    setPickedShop({
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
    })
    setLocationId(row.id)
    setShopQuery('')
    setDebouncedShopQuery('')
    setShopResults([])
    setDropdownOpen(false)
    setHighlightedIndex(-1)
    setError(null)
  }, [])

  const clearPickedShop = useCallback(() => {
    setPickedShop(null)
    setLocationId('')
    setShopQuery('')
    setDebouncedShopQuery('')
    setShopResults([])
    setDropdownOpen(false)
    setHighlightedIndex(-1)
    setError(null)
    requestAnimationFrame(() => shopInputRef.current?.focus())
  }, [])

  const effectiveDueDate = useMemo(() => {
    if (dueChoice === 'none') return null
    if (dueChoice === 'today') return dateOnlyFromNow(0)
    if (dueChoice === 'tomorrow') return dateOnlyFromNow(1)
    if (dueChoice === 'next_week') return dateOnlyFromNow(7)
    return customDueDate || null
  }, [dueChoice, customDueDate])

  if (!open) return null

  async function submit() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required.')
      return
    }
    if (trimmedTitle.length > 200) {
      setError('Title must be 200 characters or fewer.')
      return
    }
    if (!locationId) {
      setError('Shop is required.')
      return
    }
    if (dueChoice === 'custom' && !customDueDate) {
      setError('Pick a custom due date or choose No date.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: CreateTaskInput = {
        location_id: locationId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        due_date: effectiveDueDate,
        program_context: programContext,
      }

      const url = isEdit ? `/api/tasks/${taskToEdit?.id}` : '/api/tasks'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as Task & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save task')
      }
      onSuccess(data)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  const showCounter = title.length > 150

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && shopResults.length > 0) {
      setDropdownOpen(true)
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setDropdownOpen(false)
      setHighlightedIndex(-1)
      return
    }

    if (!dropdownOpen || shopResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => (i < shopResults.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => (i > 0 ? i - 1 : shopResults.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      const row = shopResults[idx]
      if (row) selectShop(row)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-arctic-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-arctic-200 px-6 py-4">
          <h2 className="text-2xl font-semibold text-onix-950">{isEdit ? 'Edit task' : 'New task'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-onix-500 hover:bg-arctic-100 hover:text-onix-900"
            aria-label="Close task modal"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-onix-700">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border border-arctic-300 px-4 py-2 text-xl leading-tight"
              maxLength={200}
              autoFocus
            />
            {showCounter && (
              <p className="mt-1 text-xs text-onix-500">{title.length}/200</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-onix-700">Shop</label>
            {locationLocked ? (
              <LockedShopRow name={lockedShopName || 'Selected shop'} cityLine={lockedShopCityLine} showClear={false} />
            ) : pickedShop ? (
              <LockedShopRow
                name={pickedShop.name}
                cityLine={cityStateLine(pickedShop.city, pickedShop.state)}
                showClear
                onClear={clearPickedShop}
              />
            ) : (
              <div ref={shopFieldRef} className="relative">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-onix-400"
                    aria-hidden
                  />
                  <input
                    ref={shopInputRef}
                    value={shopQuery}
                    onChange={e => {
                      setShopQuery(e.target.value)
                      setError(null)
                      if (e.target.value.trim().length >= 2) setDropdownOpen(true)
                    }}
                    onFocus={() => {
                      if (shopQuery.trim().length >= 2 && (shopLoading || shopResults.length > 0)) {
                        setDropdownOpen(true)
                      }
                    }}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Search shops by name or chain"
                    className="w-full rounded-lg border border-arctic-300 py-2 pl-10 pr-4 text-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={dropdownOpen}
                    aria-controls="task-shop-picker-list"
                  />
                </div>
                {dropdownOpen && debouncedShopQuery.length >= 2 && (
                  <div
                    id="task-shop-picker-list"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-auto rounded-lg border border-arctic-200 bg-white shadow-lg"
                  >
                    {shopLoading ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-sm text-onix-500">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Searching…
                      </div>
                    ) : shopResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-onix-500">No shops found.</p>
                    ) : (
                      shopResults.map((row, index) => {
                        const line = cityStateLine(row.city, row.state)
                        const active = index === highlightedIndex
                        return (
                          <button
                            key={row.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            onClick={() => selectShop(row)}
                            className={`block w-full border-b border-arctic-100 px-3 py-2.5 text-left last:border-b-0 ${
                              active ? 'bg-amber-50' : 'hover:bg-arctic-50'
                            }`}
                          >
                            <div className="font-semibold text-onix-950">{row.name}</div>
                            {line ? <div className="text-sm text-onix-500">{line}</div> : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-onix-700">Due date</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'today', label: 'Today' },
                { key: 'tomorrow', label: 'Tomorrow' },
                { key: 'next_week', label: 'Next week' },
                { key: 'custom', label: 'Custom' },
                { key: 'none', label: 'No date' },
              ].map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setDueChoice(option.key as DueDateChoice)}
                  className={`rounded-full border px-4 py-1.5 text-base ${
                    dueChoice === option.key
                      ? 'border-brand-400 bg-brand-100 text-brand-900'
                      : 'border-arctic-300 bg-white text-onix-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {dueChoice === 'custom' && (
              <input
                type="date"
                value={customDueDate}
                onChange={e => setCustomDueDate(e.target.value)}
                className="mt-3 w-full max-w-xs rounded-lg border border-arctic-300 px-3 py-2 text-base"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-onix-700">Program</label>
            <select
              value={programContext}
              onChange={e => setProgramContext(e.target.value as ProgramContext)}
              className="w-full rounded-lg border border-arctic-300 px-4 py-2 text-base"
            >
              {PROGRAM_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-onix-700">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-arctic-300 px-4 py-2 text-sm"
              placeholder="Optional context..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-arctic-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-arctic-300 px-6 py-2 text-sm font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-onix-950 px-6 py-2 text-sm font-medium text-white hover:bg-onix-900 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  )
}
