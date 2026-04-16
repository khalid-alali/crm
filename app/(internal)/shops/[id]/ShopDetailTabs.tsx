'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AddressForm from '@/components/AddressForm'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import EmailModal from '@/components/EmailModal'
import SendContractModal, { type SendContractDraftPrefill } from '@/components/SendContractModal'
import Link from 'next/link'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const PROGRAMS = [
  { key: 'multi_drive', label: 'Multi-Drive' },
  { key: 'ev_program', label: 'EV Program' },
  { key: 'oem_warranty', label: 'OEM Warranty' },
]
const PROGRAM_STATUSES = ['not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated']
const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']

type SiblingLocation = {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
  status: string
}

interface Props {
  shop: any
  siblingLocations: SiblingLocation[]
  defaultTab: string
  senderName: string
}

export default function ShopDetailTabs({ shop, siblingLocations, defaultTab, senderName }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState(defaultTab)
  const [status, setStatus] = useState(shop.status)
  const [assignedTo, setAssignedTo] = useState(() => normalizeBdrAssignedTo(shop.assigned_to))

  useEffect(() => {
    setAssignedTo(normalizeBdrAssignedTo(shop.assigned_to))
  }, [shop.assigned_to])
  const [showAddressEdit, setShowAddressEdit] = useState(false)
  const [programStatuses, setProgramStatuses] = useState<Record<string, string>>(
    Object.fromEntries(
      PROGRAMS.map(p => {
        const e = shop.program_enrollments?.find((e: any) => e.program === p.key)
        return [p.key, e?.status ?? 'not_enrolled']
      })
    )
  )
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savingPrograms, setSavingPrograms] = useState(false)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [showSendContractModal, setShowSendContractModal] = useState(false)
  const [sendContractModalDraft, setSendContractModalDraft] = useState<SendContractDraftPrefill | null>(null)
  const [sendContractFromShopDetail, setSendContractFromShopDetail] = useState(false)

  const tabs = ['details', 'programs', 'contracts', 'owner', 'locations', 'comms']

  const hideQuickActions = status === 'contracted' || status === 'active'

  useEffect(() => {
    setStatus(shop.status)
  }, [shop.status])

  const contracts = shop.contract_locations?.map((cl: any) => cl.contracts).filter(Boolean) ?? []
  const draftContract = contracts.find((c: any) => c.status === 'draft')

  async function changeStatus(newStatus: string) {
    setStatus(newStatus)
    await fetch(`/api/locations/${shop.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  async function savePrograms() {
    setSavingPrograms(true)
    for (const [program, pStatus] of Object.entries(programStatuses)) {
      await fetch(`/api/locations/${shop.id}/programs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program, status: pStatus }),
      })
    }
    setSavingPrograms(false)
    router.refresh()
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    await fetch(`/api/locations/${shop.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: noteText }),
    })
    setNoteText('')
    setSavingNote(false)
    router.refresh()
  }

  function contractToPrefill(c: any): SendContractDraftPrefill {
    return {
      id: c.id,
      counterparty_name: c.counterparty_name,
      counterparty_email: c.counterparty_email,
      standard_labor_rate: c.standard_labor_rate,
      warranty_labor_rate: c.warranty_labor_rate,
    }
  }

  function openSendContractModal(fromShopDetail: boolean, draft: any | null) {
    setSendContractFromShopDetail(fromShopDetail)
    setSendContractModalDraft(draft ? contractToPrefill(draft) : null)
    setShowSendContractModal(true)
  }

  const activityLog = [...(shop.activity_log ?? [])].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div>
      {/* Status + assigned row */}
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-onix-600">Status:</span>
          <select
            value={status}
            onChange={e => changeStatus(e.target.value)}
            className="border border-arctic-300 rounded px-2 py-1 text-sm"
          >
            {STATUSES.map(s => <option key={s} value={s}>{LOCATION_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-onix-600">Assigned:</span>
          <select
            value={assignedTo}
            onChange={async e => {
              const v = e.target.value as (typeof BDR_ASSIGNEES)[number]
              setAssignedTo(v)
              await fetch(`/api/locations/${shop.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_to: v }),
              })
              router.refresh()
            }}
            className="border border-arctic-300 rounded px-2 py-1 text-sm min-w-[7rem]"
          >
            {BDR_ASSIGNEES.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hideQuickActions && (
        <div className="flex flex-col items-end gap-1 mb-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowIntroModal(true)}
              className="px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded hover:bg-brand-700"
            >
              Send intro email
            </button>
            <button
              type="button"
              onClick={() => openSendContractModal(true, draftContract ?? null)}
              className="px-3 py-1.5 text-sm font-medium bg-onix-800 text-white rounded hover:bg-onix-950"
            >
              Send contract
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-arctic-200 mb-5">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-onix-600 hover:text-onix-800'
            }`}
          >
            {t === 'comms' ? 'Activity log' : t === 'locations' ? 'Locations' : t}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-4 max-w-lg">
          <Field label="Shop Name" value={shop.name} />
          <Field label="Chain" value={shop.chain_name} />
          <Field label="Source" value={shop.source} />
          <Field label="Notes" value={shop.notes} />
          <div className="border-t border-arctic-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Address</h3>
              <button
                onClick={() => setShowAddressEdit(v => !v)}
                className="text-xs text-brand-600 hover:underline"
              >
                {showAddressEdit ? 'Cancel' : 'Edit address'}
              </button>
            </div>
            {!showAddressEdit ? (
              <div className="text-sm text-onix-600 space-y-0.5">
                <div>{shop.address_line1 || '—'}</div>
                <div>{[shop.city, shop.state, shop.postal_code].filter(Boolean).join(', ') || ''}</div>
                {(() => {
                  const la = Number(shop.lat)
                  const ln = Number(shop.lng)
                  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
                  return (
                    <div className="text-xs text-onix-400">📍 {la.toFixed(4)}, {ln.toFixed(4)}</div>
                  )
                })()}
              </div>
            ) : (
              <AddressForm
                initial={{
                  address_line1: shop.address_line1 ?? '',
                  city: shop.city ?? '',
                  state: shop.state ?? '',
                  postal_code: shop.postal_code ?? '',
                }}
                locationId={shop.id}
                onSaved={() => { setShowAddressEdit(false); router.refresh() }}
              />
            )}
          </div>
          <div className="border-t border-arctic-100 pt-4">
            <h3 className="text-sm font-medium mb-3">Primary Contact</h3>
            <div className="text-sm text-onix-600 space-y-0.5">
              <div>{shop.primary_contact_name || '—'}</div>
              <div>{shop.primary_contact_email || ''}</div>
              <div>{shop.primary_contact_phone || ''}</div>
            </div>
          </div>
        </div>
      )}

      {/* Programs tab */}
      {tab === 'programs' && (
        <div className="space-y-3 max-w-sm">
          {PROGRAMS.map(p => (
            <div key={p.key} className="flex items-center justify-between">
              <span className="text-sm font-medium w-32">{p.label}</span>
              <select
                value={programStatuses[p.key]}
                onChange={e => setProgramStatuses(ps => ({ ...ps, [p.key]: e.target.value }))}
                className="border border-arctic-300 rounded px-2 py-1 text-sm"
              >
                {PROGRAM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          ))}
          <button
            onClick={savePrograms}
            disabled={savingPrograms}
            className="mt-2 px-4 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {savingPrograms ? 'Saving…' : 'Save Programs'}
          </button>
        </div>
      )}

      {/* Contracts tab */}
      {tab === 'contracts' && (
        <div className="space-y-4">
          {contracts.length === 0 && (
            <p className="text-sm text-onix-600">No contracts linked to this shop yet.</p>
          )}
          {contracts.map((contract: any) => (
            <div key={contract.id} className="border border-arctic-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{contract.counterparty_company || contract.counterparty_name || 'Contract'}</span>
                  {contract.legal_entity_name && (
                    <span className="ml-2 text-xs text-onix-400">Signed as: {contract.legal_entity_name}</span>
                  )}
                </div>
                <StatusBadge status={contract.status} />
              </div>
              {contract.standard_labor_rate && (
                <div className="text-xs text-onix-600">
                  Standard rate: ${contract.standard_labor_rate}/hr · Warranty rate: ${contract.warranty_labor_rate}/hr
                </div>
              )}
              {contract.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => openSendContractModal(false, contract)}
                  className="px-3 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-700"
                >
                  Send via Zoho Sign
                </button>
              )}
              {contract.doc_url && (
                <a href={contract.doc_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">
                  View document
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Owner tab */}
      {tab === 'owner' && (
        <div>
          {shop.owners ? (
            <div className="border border-arctic-200 rounded-lg p-4 max-w-sm space-y-2">
              <div className="font-medium">{shop.owners.name}</div>
              {shop.owners.email && <div className="text-sm text-onix-600">{shop.owners.email}</div>}
              {shop.owners.phone && <div className="text-sm text-onix-600">{shop.owners.phone}</div>}
              {shop.owners.title && <div className="text-sm text-onix-400">{shop.owners.title}</div>}
              <Link href={`/owners/${shop.owners.id}`} className="text-sm text-brand-600 hover:underline">
                View owner page →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-onix-600">No owner linked.</p>
          )}
        </div>
      )}

      {/* Locations tab — all physical shops for this owner (or this row only if no owner) */}
      {tab === 'locations' && (
        <div className="space-y-4">
          <p className="text-sm text-onix-600 max-w-2xl">
            {shop.owner_id
              ? 'Physical shops under this owner.'
              : 'Link an owner on the Edit page to group multiple shops. Until then, only this location appears here.'}
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={shop.owner_id ? `/shops/new?owner_id=${encodeURIComponent(shop.owner_id)}` : '/shops/new'}
              className="inline-flex px-4 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
            >
              Add location
            </Link>
            {!shop.owner_id && (
              <span className="text-xs text-onix-600">Set owner on the new shop form to keep the group together.</span>
            )}
          </div>
          <div className="border border-arctic-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-arctic-50 border-b border-arctic-200 text-left text-xs font-medium text-onix-600 uppercase tracking-wide">
                  <th className="px-4 py-2">Shop</th>
                  <th className="px-4 py-2">City / State</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {siblingLocations.map(loc => (
                  <tr
                    key={loc.id}
                    className={`border-b border-arctic-100 last:border-0 ${
                      loc.id === shop.id ? 'bg-brand-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-onix-950">{loc.name}</span>
                        <ChainBadge chain={loc.chain_name} />
                        {loc.id === shop.id && (
                          <span className="text-[10px] uppercase tracking-wide text-brand-700 font-medium px-1.5 py-0.5 rounded bg-brand-100">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-onix-600">
                      {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={loc.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                      <Link href={`/shops/${loc.id}`} className="text-brand-600 hover:underline">
                        Open
                      </Link>
                      <Link href={`/shops/${loc.id}/edit`} className="text-brand-600 hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity log tab */}
      {tab === 'comms' && (
        <div className="space-y-4">
          {/* Add note */}
          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={2}
              placeholder="Add a note…"
              className="flex-1 border border-arctic-300 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={addNote}
              disabled={savingNote}
              className="px-4 py-2 text-sm bg-onix-800 text-white rounded hover:bg-onix-950 disabled:opacity-50"
            >
              {savingNote ? '…' : 'Add'}
            </button>
          </div>

          {/* Log entries */}
          <div className="space-y-2">
            {activityLog.length === 0 && <p className="text-sm text-onix-400">No activity yet.</p>}
            {activityLog.map((entry: any) => (
              <div key={entry.id} className="border border-arctic-100 rounded p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium capitalize text-onix-800">{entry.type.replace('_', ' ')}</span>
                  {entry.sent_by && <span className="text-xs text-onix-400">by {entry.sent_by}</span>}
                  <span className="text-xs text-onix-400 ml-auto tabular-nums">
                    {new Date(entry.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {entry.subject && <div className="font-medium text-xs text-onix-600">{entry.subject}</div>}
                {entry.body && <div className="text-onix-600 text-xs whitespace-pre-wrap mt-1">{entry.body}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showIntroModal && (
        <EmailModal
          locationId={shop.id}
          shopName={shop.name}
          contactName={shop.primary_contact_name ?? ''}
          contactEmail={shop.primary_contact_email ?? ''}
          template="intro"
          senderName={senderName}
          fromShopDetail
          onClose={() => setShowIntroModal(false)}
          onSent={() => {
            setShowIntroModal(false)
            router.refresh()
          }}
        />
      )}

      {showSendContractModal && (
        <SendContractModal
          key={sendContractModalDraft?.id ?? 'new'}
          locationId={shop.id}
          shop={shop}
          initialDraft={sendContractModalDraft}
          fromShopDetail={sendContractFromShopDetail}
          onClose={() => setShowSendContractModal(false)}
          onSent={() => {
            setShowSendContractModal(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs font-medium text-onix-600 mb-0.5">{label}</div>
      <div className="text-sm text-onix-800">{value || '—'}</div>
    </div>
  )
}
