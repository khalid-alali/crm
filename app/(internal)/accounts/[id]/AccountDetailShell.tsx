'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import ProgramBadge from '@/components/ProgramBadge'
import StateSelect from '@/components/StateSelect'
import AccountDetailEditor from './AccountDetailEditor'
import AccountContactsPanel from '@/components/AccountContactsPanel'
import { contractStatusBadgeClass, contractStatusLabel } from '@/lib/contract-status-display'
import DeleteAccountButton from '@/components/DeleteAccountButton'
import { formatBulkPipelineStatusLogBody } from '@/lib/location-status-labels'

const TABS = ['activity', 'contracts', 'programs'] as const
type TabKey = (typeof TABS)[number]

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function accountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

export type AccountRow = {
  id: string
  business_name: string
  notes: string | null
}

export type LocationRow = {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
  status: string
  program_enrollments: { program: string; status: string }[] | null
}

export type ContractRow = {
  id: string
  counterparty_company: string | null
  counterparty_name: string | null
  legal_entity_name: string | null
  status: string
  signing_date: string | null
  doc_url: string | null
}

export type ActivityEntry = {
  id: string
  location_id: string
  type: string
  subject: string | null
  body: string | null
  to_email: string | null
  sent_by: string | null
  created_at: string
  locations: { name: string } | null
}

export default function AccountDetailShell({
  account,
  locations,
  contracts,
  activityEntries,
  programCounts,
  allowContractDelete = false,
  missingBusinessName = false,
  canDeleteAccount = false,
}: {
  account: AccountRow
  locations: LocationRow[]
  contracts: ContractRow[]
  activityEntries: ActivityEntry[]
  programCounts: Record<string, number>
  allowContractDelete?: boolean
  missingBusinessName?: boolean
  canDeleteAccount?: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('activity')
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)
  const [contractDeleteError, setContractDeleteError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(account.business_name ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [addingLoc, setAddingLoc] = useState(false)
  const [locSaving, setLocSaving] = useState(false)
  const [locError, setLocError] = useState('')
  const [newLoc, setNewLoc] = useState({
    name: '',
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
  })

  const activeEnrollmentTotal = Object.values(programCounts).reduce((a, b) => a + b, 0)
  const distinctStatuses = [...new Set(locations.map(l => l.status))]

  useEffect(() => {
    if (!editingName) setNameDraft(account.business_name ?? '')
  }, [account.business_name, editingName])

  async function createLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!newLoc.name.trim()) {
      setLocError('Shop name is required.')
      return
    }
    setLocSaving(true)
    setLocError('')
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLoc.name.trim(),
          account_id: account.id,
          address_line1: newLoc.address_line1.trim() || undefined,
          city: newLoc.city.trim() || undefined,
          state: newLoc.state.trim() || undefined,
          postal_code: newLoc.postal_code.trim() || undefined,
          status: 'lead',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to create shop')
      setAddingLoc(false)
      setNewLoc({ name: '', address_line1: '', city: '', state: '', postal_code: '' })
      router.push(`/shops/${(data as { id: string }).id}`)
    } catch (err: unknown) {
      setLocError(err instanceof Error ? err.message : 'Failed to create shop')
    } finally {
      setLocSaving(false)
    }
  }

  async function deleteAccountContract(contractId: string, displayName: string) {
    if (
      !window.confirm(
        `Permanently delete “${displayName}” from the CRM? In-flight Zoho requests are recalled first. This cannot be undone.`,
      )
    ) {
      return
    }
    setContractDeleteError(null)
    setDeletingContractId(contractId)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Delete failed')
      router.refresh()
    } catch (e: unknown) {
      setContractDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingContractId(null)
    }
  }

  async function saveAccountName() {
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameError('Account name is required.')
      return
    }
    setNameSaving(true)
    setNameError(null)
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to update account name')
      setEditingName(false)
      router.refresh()
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Failed to update account name')
    } finally {
      setNameSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-3 text-sm text-onix-600">
        <Link href="/accounts" className="hover:underline">
          Accounts
        </Link>
        <span className="mx-1.5 text-onix-400">/</span>
        <span className="font-medium text-onix-800">{account.business_name}</span>
      </div>

      {/* Header card */}
      <div className="mb-6 overflow-hidden rounded-xl border border-arctic-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white"
            aria-hidden
          >
            {accountInitials(account.business_name || '?')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {editingName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      className="w-full max-w-xl rounded-md border border-arctic-300 px-2.5 py-1.5 text-xl font-semibold text-onix-900"
                      aria-label="Account name"
                      disabled={nameSaving}
                    />
                    <button
                      type="button"
                      onClick={saveAccountName}
                      disabled={nameSaving}
                      className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {nameSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(false)
                        setNameDraft(account.business_name ?? '')
                        setNameError(null)
                      }}
                      disabled={nameSaving}
                      className="rounded-md border border-arctic-300 bg-white px-2.5 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-onix-900">{account.business_name}</h1>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(true)
                        setNameError(null)
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-onix-400 hover:bg-arctic-100 hover:text-onix-700"
                      aria-label="Edit account name"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
                {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
              </div>
              <DeleteAccountButton
                accountId={account.id}
                accountName={account.business_name}
                canDelete={canDeleteAccount}
                className="rounded-lg border border-red-500 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:border-arctic-300 disabled:text-onix-400 disabled:hover:bg-white"
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-arctic-100 sm:grid-cols-4">
          <div className="border-r border-arctic-100 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-onix-500">Locations</div>
            <div className="text-lg font-semibold text-onix-900">{locations.length}</div>
          </div>
          <div className="border-r border-arctic-100 px-4 py-3 sm:border-r-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-onix-500">Contracts</div>
            <div className="text-lg font-semibold text-onix-900">{contracts.length}</div>
          </div>
          <div className="border-r border-t border-arctic-100 px-4 py-3 sm:border-t-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-onix-500">Active programs</div>
            <div className="text-lg font-semibold text-onix-900">{activeEnrollmentTotal || '—'}</div>
          </div>
          <div className="border-t border-arctic-100 px-4 py-3 sm:border-t-0 sm:border-l sm:border-arctic-100">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-onix-500">Shop statuses</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {distinctStatuses.length === 0 ? (
                <span className="text-sm text-onix-400">—</span>
              ) : (
                distinctStatuses.map(s => <StatusBadge key={s} status={s} />)
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Left column */}
        <div className="space-y-5">
          <div className="rounded-xl border border-arctic-200 bg-white p-4 shadow-sm">
            <AccountDetailEditor account={account} />
          </div>

          <AccountContactsPanel
            accountId={account.id}
            locations={locations.map(l => ({ id: l.id, name: l.name }))}
            missingBusinessName={missingBusinessName}
          />

          <div className="rounded-xl border border-arctic-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-arctic-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-onix-800">
                Locations{' '}
                <span className="rounded-full bg-arctic-100 px-2 py-0.5 text-xs font-medium text-onix-500">
                  {locations.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setAddingLoc(a => !a)
                  setLocError('')
                }}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                {addingLoc ? 'Cancel' : 'Add location'}
              </button>
            </div>

            {addingLoc && (
              <form onSubmit={createLocation} className="border-b border-arctic-100 bg-indigo-50/60 px-4 py-3">
                {locError && <p className="mb-2 text-xs text-red-600">{locError}</p>}
                <div className="space-y-2">
                  <input
                    placeholder="Shop name *"
                    value={newLoc.name}
                    onChange={e => setNewLoc(l => ({ ...l, name: e.target.value }))}
                    className="w-full rounded border border-arctic-300 px-2.5 py-1.5 text-sm"
                    required
                  />
                  <input
                    placeholder="Street address"
                    value={newLoc.address_line1}
                    onChange={e => setNewLoc(l => ({ ...l, address_line1: e.target.value }))}
                    className="w-full rounded border border-arctic-300 px-2.5 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="City"
                      value={newLoc.city}
                      onChange={e => setNewLoc(l => ({ ...l, city: e.target.value }))}
                      className="rounded border border-arctic-300 px-2.5 py-1.5 text-sm"
                    />
                    <StateSelect value={newLoc.state} onChange={s => setNewLoc(l => ({ ...l, state: s }))} />
                  </div>
                  <input
                    placeholder="Postal code"
                    value={newLoc.postal_code}
                    onChange={e => setNewLoc(l => ({ ...l, postal_code: e.target.value }))}
                    className="w-full rounded border border-arctic-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={locSaving}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {locSaving ? 'Creating…' : 'Create & open shop'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingLoc(false)
                      setLocError('')
                      setNewLoc({ name: '', address_line1: '', city: '', state: '', postal_code: '' })
                    }}
                    className="rounded-lg border border-arctic-300 bg-white px-3 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50"
                  >
                    Clear
                  </button>
                </div>
              </form>
            )}

            <ul className="divide-y divide-arctic-100">
              {locations.length === 0 && !addingLoc && (
                <li className="px-4 py-6 text-center text-sm text-onix-500">No locations yet.</li>
              )}
              {locations.map(loc => (
                <li key={loc.id}>
                  <Link
                    href={`/shops/${loc.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-arctic-50"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-onix-900">{loc.name}</span>
                        <ChainBadge chain={loc.chain_name} />
                      </div>
                      <div className="text-xs text-onix-500">
                        {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <ProgramBadge enrollments={loc.program_enrollments ?? []} />
                      <StatusBadge status={loc.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column — tabs */}
        <div className="overflow-hidden rounded-xl border border-arctic-200 bg-white shadow-sm">
          <div className="flex border-b border-arctic-200 bg-arctic-50">
            {TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 border-r border-arctic-200 px-3 py-2.5 text-sm font-medium capitalize last:border-r-0 ${
                  tab === t ? 'bg-slate-800 text-white' : 'bg-white text-onix-600 hover:bg-arctic-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === 'activity' && (
              <div className="space-y-2">
                <p className="text-xs text-onix-500">
                  Activity across all shops for this account. Add notes from each shop&apos;s Activity tab.
                </p>
                {activityEntries.length === 0 ? (
                  <p className="py-6 text-center text-sm text-onix-400">No activity yet.</p>
                ) : (
                  activityEntries.map(entry => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-arctic-200 border-l-4 border-l-arctic-300 p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-onix-800">
                          {entry.type?.replace(/_/g, ' ') ?? 'activity'}
                        </span>
                        {entry.locations?.name && (
                          <Link
                            href={`/shops/${entry.location_id}`}
                            className="text-xs font-medium text-brand-600 hover:underline"
                          >
                            {entry.locations.name}
                          </Link>
                        )}
                        {entry.sent_by && <span className="text-xs text-onix-400">by {entry.sent_by}</span>}
                        <span className="ml-auto text-xs text-onix-400">{fmtDate(entry.created_at)}</span>
                      </div>
                      {entry.subject && <div className="text-sm font-medium text-onix-800">{entry.subject}</div>}
                      {entry.body && (
                        <div className="mt-1 whitespace-pre-wrap text-sm text-onix-700">
                          {formatBulkPipelineStatusLogBody(entry.body)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'contracts' && (
              <div className="space-y-2">
                {contractDeleteError && <p className="text-sm text-red-600">{contractDeleteError}</p>}
                {contracts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-onix-400">No contracts yet.</p>
                ) : (
                  contracts.map(contract => (
                    <div
                      key={contract.id}
                      className="flex flex-col gap-2 rounded-lg border border-arctic-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-medium">
                          {contract.counterparty_company || contract.counterparty_name || 'Contract'}
                        </span>
                        {contract.legal_entity_name && (
                          <span className="ml-2 text-xs text-onix-400">Signed as: {contract.legal_entity_name}</span>
                        )}
                        {contract.doc_url && (
                          <a
                            href={contract.doc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-xs text-brand-600 hover:underline"
                          >
                            View document
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                        {contract.signing_date && (
                          <span className="text-xs text-onix-400">
                            {new Date(contract.signing_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${contractStatusBadgeClass(contract.status)}`}
                        >
                          {contractStatusLabel(contract.status)}
                        </span>
                        {allowContractDelete && contract.status !== 'signed' && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteAccountContract(
                                contract.id,
                                contract.counterparty_company || contract.counterparty_name || 'Contract',
                              )
                            }
                            disabled={deletingContractId === contract.id}
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingContractId === contract.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'programs' && (
              <div className="space-y-3">
                <p className="text-xs text-onix-500">Active enrollments by program. Edit programs on each shop page.</p>
                {Object.keys(programCounts).length === 0 ? (
                  <p className="text-sm text-onix-400">No active programs across locations.</p>
                ) : (
                  <ul className="space-y-1">
                    {Object.entries(programCounts).map(([p, cnt]) => (
                      <li key={p} className="flex justify-between rounded border border-arctic-100 px-3 py-2 text-sm">
                        <span className="text-onix-700">{p.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-onix-900">
                          {cnt} location{cnt !== 1 ? 's' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-arctic-100 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-onix-500">By shop</div>
                  <ul className="mt-2 divide-y divide-arctic-100 rounded border border-arctic-100">
                    {locations.map(loc => (
                      <li key={loc.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                        <Link href={`/shops/${loc.id}`} className="font-medium text-brand-600 hover:underline">
                          {loc.name}
                        </Link>
                        <div className="shrink-0 text-right">
                          <ProgramBadge enrollments={loc.program_enrollments ?? []} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
