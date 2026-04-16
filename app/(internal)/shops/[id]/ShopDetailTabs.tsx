'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, FileText, Loader2, Mail, Pencil, X } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import DeleteShopButton from '@/components/DeleteShopButton'
import EmailModal from '@/components/EmailModal'
import SendContractModal, { type SendContractDraftPrefill } from '@/components/SendContractModal'
import ReviseSentContractModal from '@/components/ReviseSentContractModal'
import OwnerSelect from '@/components/OwnerSelect'
import StateSelect from '@/components/StateSelect'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { LOCATION_SOURCES, formatLocationSource } from '@/lib/location-source'

const PROGRAMS = [
  { key: 'multi_drive', label: 'Multi-Drive' },
  { key: 'ev_program', label: 'EV Program' },
  { key: 'oem_warranty', label: 'OEM Warranty' },
]
const PROGRAM_STATUSES = ['not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated']
const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']
const TABS = ['activity', 'contracts', 'programs'] as const
type TabKey = (typeof TABS)[number]
type EditField =
  | 'name'
  | 'owner'
  | 'primary_contact_name'
  | 'primary_contact_email'
  | 'primary_contact_phone'
  | 'location'
  | 'source'
  | 'notes'

type SiblingLocation = {
  id: string
  name: string
  status: string
}

interface Props {
  shop: any
  siblingLocations: SiblingLocation[]
  defaultTab: string
  senderName: string
}

type AdminSearchResult = {
  id: string
  name: string
  status: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  motherduck_shop_id: string
  primary_contact_email: string | null
  owner_name: string | null
  owner_email: string | null
}

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

function contractAwaitingSignature(contract: { status?: string; zoho_sign_request_id?: string | null }) {
  const st = contract.status
  const rid = typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
  return (st === 'sent' || st === 'viewed') && Boolean(rid)
}

function contractIsSentWithZohoRequest(contract: { status?: string; zoho_sign_request_id?: string | null }) {
  const rid = typeof contract.zoho_sign_request_id === 'string' ? contract.zoho_sign_request_id.trim() : ''
  return contract.status === 'sent' && Boolean(rid)
}

function contractDateSubline(contract: { status?: string; signing_date?: string | null; zoho_sent_at?: string | null }) {
  if (contract.status === 'signed') {
    return <div className="mt-2 text-xs text-onix-600">Completed on: {fmtDate(contract.signing_date)}</div>
  }
  if (contract.status === 'sent' || contract.status === 'viewed') {
    return <div className="mt-2 text-xs text-onix-600">Sent: {fmtDate(contract.zoho_sent_at)}</div>
  }
  return null
}

function activityBadge(value: string | null | undefined): string {
  if (!value) return 'No activity'
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return 'No activity'
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'Today'
  return `${days}d ago`
}

export default function ShopDetailTabs({ shop, siblingLocations, defaultTab, senderName }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>(defaultTab === 'contracts' || defaultTab === 'programs' ? defaultTab : 'activity')
  const [status, setStatus] = useState(shop.status)
  const [operationalStatus, setOperationalStatus] = useState<string | null>(null)
  const [operationalStatusLoading, setOperationalStatusLoading] = useState(false)
  const [assignedTo, setAssignedTo] = useState(() => normalizeBdrAssignedTo(shop.assigned_to))
  const [programStatuses, setProgramStatuses] = useState<Record<string, string>>(
    Object.fromEntries(
      PROGRAMS.map(program => {
        const e = shop.program_enrollments?.find((enrollment: any) => enrollment.program === program.key)
        return [program.key, e?.status ?? 'not_enrolled']
      }),
    ),
  )
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savingPrograms, setSavingPrograms] = useState(false)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [showSendContractModal, setShowSendContractModal] = useState(false)
  const [sendContractModalDraft, setSendContractModalDraft] = useState<SendContractDraftPrefill | null>(null)
  const [remindingContractId, setRemindingContractId] = useState<string | null>(null)
  const [contractActionError, setContractActionError] = useState<string | null>(null)
  const [reviseContractModal, setReviseContractModal] = useState<{
    id: string
    counterparty_name: string | null
    counterparty_email: string | null
  } | null>(null)
  const [currentAdminShopId, setCurrentAdminShopId] = useState(shop.motherduck_shop_id ?? '')
  const [adminSaving, setAdminSaving] = useState(false)
  const [showAdminMatchModal, setShowAdminMatchModal] = useState(false)
  const [adminSearch, setAdminSearch] = useState('')
  const [adminSearching, setAdminSearching] = useState(false)
  const [adminResults, setAdminResults] = useState<AdminSearchResult[]>([])
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null)
  const [inlineEdit, setInlineEdit] = useState<EditField | null>(null)
  const [inlineSaving, setInlineSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState({
    name: shop.name ?? '',
    owner_id: shop.owner_id ?? null,
    primary_contact_name: shop.primary_contact_name ?? '',
    primary_contact_email: shop.primary_contact_email ?? '',
    primary_contact_phone: shop.primary_contact_phone ?? '',
    address_line1: shop.address_line1 ?? '',
    city: shop.city ?? '',
    state: shop.state ?? '',
    postal_code: shop.postal_code ?? '',
    source: shop.source ?? '',
    notes: shop.notes ?? '',
  })

  useEffect(() => {
    setAssignedTo(normalizeBdrAssignedTo(shop.assigned_to))
    setStatus(shop.status)
    setCurrentAdminShopId(shop.motherduck_shop_id ?? '')
    setInlineDraft({
      name: shop.name ?? '',
      owner_id: shop.owner_id ?? null,
      primary_contact_name: shop.primary_contact_name ?? '',
      primary_contact_email: shop.primary_contact_email ?? '',
      primary_contact_phone: shop.primary_contact_phone ?? '',
      address_line1: shop.address_line1 ?? '',
      city: shop.city ?? '',
      state: shop.state ?? '',
      postal_code: shop.postal_code ?? '',
      source: shop.source ?? '',
      notes: shop.notes ?? '',
    })
    setInlineEdit(null)
    setInlineError(null)
  }, [shop.assigned_to, shop.status, shop.motherduck_shop_id])

  useEffect(() => {
    if (tab !== 'programs') return
    if (!shop.motherduck_shop_id) {
      setOperationalStatus(null)
      return
    }

    let isCancelled = false

    async function loadOperationalStatus() {
      setOperationalStatusLoading(true)
      try {
        const res = await fetch(`/api/locations/${shop.id}/operational-status`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => ({}))
        if (isCancelled) return
        if (res.ok && typeof data.operational_status === 'string' && data.operational_status.trim()) {
          setOperationalStatus(data.operational_status)
        } else {
          setOperationalStatus(null)
        }
      } catch {
        if (!isCancelled) setOperationalStatus(null)
      } finally {
        if (!isCancelled) setOperationalStatusLoading(false)
      }
    }

    void loadOperationalStatus()
    return () => {
      isCancelled = true
    }
  }, [tab, shop.id, shop.motherduck_shop_id])

  const contracts = shop.contract_locations?.map((cl: any) => cl.contracts).filter(Boolean) ?? []
  const draftContract = contracts.find((contract: any) => contract.status === 'draft')
  const sentAwaitingSignatureContracts = contracts
    .filter((c: any) => contractAwaitingSignature(c))
    .sort((a: any, b: any) => {
      const ta = new Date(a.zoho_sent_at ?? a.created_at ?? 0).getTime()
      const tb = new Date(b.zoho_sent_at ?? b.created_at ?? 0).getTime()
      return tb - ta
    })
  const primarySentContract = sentAwaitingSignatureContracts[0] as any | undefined
  const headerContractIsResend = !draftContract && Boolean(primarySentContract)
  const headerRemindInFlight =
    Boolean(primarySentContract) && remindingContractId === primarySentContract?.id

  async function remindContract(contractId: string) {
    setContractActionError(null)
    setRemindingContractId(contractId)
    try {
      const res = await fetch(`/api/locations/${shop.id}/contracts/${contractId}/zoho-remind`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Reminder failed')
      router.refresh()
    } catch (e: unknown) {
      setContractActionError(e instanceof Error ? e.message : 'Reminder failed')
    } finally {
      setRemindingContractId(null)
    }
  }
  const activityLog = [...(shop.activity_log ?? [])].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

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

  async function saveAdminShopId(shopId: string, motherduckStatus?: string | null) {
    const nextShopId = shopId.trim()
    if (!nextShopId) return false
    setAdminSaving(true)
    setAdminFeedback(null)

    const res = await fetch(`/api/locations/${shop.id}/admin-shop-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motherduck_shop_id: nextShopId,
        motherduck_status: motherduckStatus ?? null,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setAdminFeedback(data.error ?? 'Failed to save admin shop id')
      setAdminSaving(false)
      return false
    }

    setCurrentAdminShopId(nextShopId)
    setAdminFeedback(data.movedFrom?.name ? `Moved from ${data.movedFrom.name} and assigned here.` : 'Admin shop id saved.')
    setAdminSaving(false)
    router.refresh()
    return true
  }

  async function saveAdminShopResult(shopId: string, motherduckStatus?: string | null) {
    const ok = await saveAdminShopId(shopId, motherduckStatus)
    if (ok) {
      setShowAdminMatchModal(false)
      setAdminResults([])
    }
  }

  async function clearAdminShopId() {
    setAdminSaving(true)
    setAdminFeedback(null)
    const res = await fetch(`/api/locations/${shop.id}/admin-shop-id`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setAdminFeedback(data.error ?? 'Failed to clear admin shop id')
      setAdminSaving(false)
      return
    }
    setCurrentAdminShopId('')
    setAdminFeedback('Admin shop id cleared.')
    setAdminSaving(false)
    router.refresh()
  }

  function openAdminMatchModal() {
    setAdminFeedback(null)
    setAdminSearch(shop.name ?? '')
    setAdminResults([])
    setShowAdminMatchModal(true)
  }

  async function searchAdminShops() {
    const q = adminSearch.trim()
    if (q.length < 2) {
      setAdminResults([])
      return
    }
    setAdminSearching(true)
    setAdminFeedback(null)
    const res = await fetch(`/api/admin-shops/search?q=${encodeURIComponent(q)}`)
    const data = await res.json().catch(() => ({ results: [] }))
    if (!res.ok) {
      setAdminFeedback(data.error ?? 'Search failed')
      setAdminSearching(false)
      return
    }
    setAdminResults(Array.isArray(data.results) ? data.results : [])
    setAdminSearching(false)
  }

  async function saveInline(patch: Record<string, unknown>) {
    setInlineSaving(true)
    setInlineError(null)
    try {
      const res = await fetch(`/api/locations/${shop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Failed to save field')
      }
      setInlineEdit(null)
      router.refresh()
    } catch (e: unknown) {
      setInlineError(e instanceof Error ? e.message : 'Failed to save field')
    } finally {
      setInlineSaving(false)
    }
  }

  function editIcon(field: EditField) {
    return (
      <button
        type="button"
        onClick={() => {
          setInlineError(null)
          setInlineEdit(field)
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-onix-400 hover:bg-arctic-100 hover:text-onix-700"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
    )
  }

  return (
    <div className="space-y-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-onix-500">
        <Link href="/shops" className="text-brand-700 hover:underline">Shops</Link>
        <span>/</span>
        <span>{shop.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[2rem] font-semibold tracking-tight text-onix-950">{shop.name}</h1>
          <StatusBadge status={status} />
          {shop.chain_name && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{shop.chain_name}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={assignedTo}
            onChange={async e => {
              const next = e.target.value as (typeof BDR_ASSIGNEES)[number]
              setAssignedTo(next)
              await fetch(`/api/locations/${shop.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assigned_to: next }),
              })
              router.refresh()
            }}
            className="min-w-[7rem] rounded-lg border border-arctic-300 bg-white px-3 py-2 text-sm"
          >
            {BDR_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowIntroModal(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Mail className="h-4 w-4" aria-hidden /> Email
          </button>
          <button
            onClick={() => {
              if (headerContractIsResend && primarySentContract) {
                void remindContract(primarySentContract.id)
                return
              }
              setContractActionError(null)
              setSendContractModalDraft(
                draftContract
                  ? {
                      id: draftContract.id,
                      counterparty_name: draftContract.counterparty_name,
                      counterparty_email: draftContract.counterparty_email,
                      standard_labor_rate: draftContract.standard_labor_rate,
                      warranty_labor_rate: draftContract.warranty_labor_rate,
                    }
                  : null,
              )
              setShowSendContractModal(true)
            }}
            disabled={headerRemindInFlight}
            className="inline-flex items-center gap-1 rounded-lg border border-arctic-300 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50 disabled:opacity-60"
          >
            {headerRemindInFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-4 w-4" aria-hidden />
            )}
            {headerContractIsResend ? 'Resend contract' : 'Send contract'}
          </button>
          <DeleteShopButton shopId={shop.id} shopName={shop.name} className="rounded-lg border border-red-500 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50" />
        </div>
      </div>
      {contractActionError && <p className="text-sm text-red-600">{contractActionError}</p>}

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:border-r lg:border-arctic-200 lg:pr-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-arctic-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-onix-400">Status</div>
              <div className="mt-1 text-xl font-semibold text-brand-700">{LOCATION_STATUS_LABELS[status]}</div>
              <select value={status} onChange={e => changeStatus(e.target.value)} className="mt-2 w-full rounded border border-arctic-300 px-2 py-1 text-xs">
                {STATUSES.map(s => <option key={s} value={s}>{LOCATION_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-arctic-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-onix-400">Last Activity</div>
              <div className="mt-2 inline-flex rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700">{activityBadge(activityLog[0]?.created_at)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Owner
            {editIcon('owner')}
          </div>
          {inlineEdit === 'owner' ? (
            <div className="space-y-2">
              <OwnerSelect
                value={inlineDraft.owner_id}
                onChange={ownerId => setInlineDraft(d => ({ ...d, owner_id: ownerId }))}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => saveInline({ owner_id: inlineDraft.owner_id })}
                  disabled={inlineSaving}
                  className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setInlineEdit(null)}
                  className="rounded border border-arctic-300 px-2 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-onix-800">{shop.owners?.name ?? 'No owner linked'}</div>
              {shop.owners?.email && <div className="text-sm text-onix-500">{shop.owners.email}</div>}
            </>
          )}
          {shop.owners?.phone && (
            <a
              href={`tel:${String(shop.owners.phone).replace(/[^\d+]/g, '')}`}
              className="block text-sm text-brand-700 hover:underline"
            >
              {shop.owners.phone}
            </a>
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Primary Contact Name
            {editIcon('primary_contact_name')}
          </div>
          {inlineEdit === 'primary_contact_name' ? (
            <div className="flex items-center gap-2">
              <input
                value={inlineDraft.primary_contact_name}
                onChange={e => setInlineDraft(d => ({ ...d, primary_contact_name: e.target.value }))}
                className="w-full rounded border border-arctic-300 px-2 py-1 text-sm"
              />
              <button type="button" onClick={() => saveInline({ primary_contact_name: inlineDraft.primary_contact_name })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            <div className="text-sm text-onix-800">{shop.primary_contact_name || '—'}</div>
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Primary Contact Email
            {editIcon('primary_contact_email')}
          </div>
          {inlineEdit === 'primary_contact_email' ? (
            <div className="flex items-center gap-2">
              <input
                value={inlineDraft.primary_contact_email}
                onChange={e => setInlineDraft(d => ({ ...d, primary_contact_email: e.target.value }))}
                className="w-full rounded border border-arctic-300 px-2 py-1 text-sm"
              />
              <button type="button" onClick={() => saveInline({ primary_contact_email: inlineDraft.primary_contact_email })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            shop.primary_contact_email && <div className="text-sm text-onix-500">{shop.primary_contact_email}</div>
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Primary Contact Phone
            {editIcon('primary_contact_phone')}
          </div>
          {inlineEdit === 'primary_contact_phone' ? (
            <div className="flex items-center gap-2">
              <input
                value={inlineDraft.primary_contact_phone}
                onChange={e => setInlineDraft(d => ({ ...d, primary_contact_phone: e.target.value }))}
                className="w-full rounded border border-arctic-300 px-2 py-1 text-sm"
              />
              <button type="button" onClick={() => saveInline({ primary_contact_phone: inlineDraft.primary_contact_phone })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            shop.primary_contact_phone && (
              <a
                href={`tel:${String(shop.primary_contact_phone).replace(/[^\d+]/g, '')}`}
                className="block text-sm text-brand-700 hover:underline"
              >
                {shop.primary_contact_phone}
              </a>
            )
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Location
            {editIcon('location')}
          </div>
          {inlineEdit === 'location' ? (
            <div className="space-y-2">
              <input value={inlineDraft.address_line1} onChange={e => setInlineDraft(d => ({ ...d, address_line1: e.target.value }))} placeholder="Address line 1" className="w-full rounded border border-arctic-300 px-2 py-1 text-sm" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input
                  value={inlineDraft.city}
                  onChange={e => setInlineDraft(d => ({ ...d, city: e.target.value }))}
                  placeholder="City"
                  className="rounded border border-arctic-300 px-2 py-1 text-sm sm:col-span-8"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <StateSelect
                  value={inlineDraft.state}
                  onChange={state => setInlineDraft(d => ({ ...d, state }))}
                  className="rounded border border-arctic-300 bg-white px-2 py-1 text-sm sm:col-span-5"
                />
                <input
                  value={inlineDraft.postal_code}
                  onChange={e => setInlineDraft(d => ({ ...d, postal_code: e.target.value }))}
                  placeholder="Postal"
                  className="rounded border border-arctic-300 px-2 py-1 text-sm sm:col-span-7"
                />
              </div>
              <button type="button" onClick={() => saveInline({ address_line1: inlineDraft.address_line1, city: inlineDraft.city, state: inlineDraft.state, postal_code: inlineDraft.postal_code })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            <div className="text-sm text-onix-800">
              {[shop.address_line1, [shop.city, shop.state].filter(Boolean).join(', '), shop.postal_code]
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Source
            {editIcon('source')}
          </div>
          {inlineEdit === 'source' ? (
            <div className="flex items-center gap-2">
              <select value={inlineDraft.source} onChange={e => setInlineDraft(d => ({ ...d, source: e.target.value }))} className="w-full rounded border border-arctic-300 px-2 py-1 text-sm">
                <option value="">—</option>
                {LOCATION_SOURCES.map(source => (
                  <option key={source} value={source}>
                    {formatLocationSource(source)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => saveInline({ source: inlineDraft.source })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            <div className="text-sm text-onix-800">{formatLocationSource(shop.source) || '—'}</div>
          )}

          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
            Notes
            {editIcon('notes')}
          </div>
          {inlineEdit === 'notes' ? (
            <div className="space-y-2">
              <textarea value={inlineDraft.notes} onChange={e => setInlineDraft(d => ({ ...d, notes: e.target.value }))} rows={3} className="w-full rounded border border-arctic-300 px-2 py-1 text-sm" />
              <button type="button" onClick={() => saveInline({ notes: inlineDraft.notes })} disabled={inlineSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60">Save</button>
            </div>
          ) : (
            <div className="text-sm text-onix-800 whitespace-pre-wrap">{shop.notes || '—'}</div>
          )}
          {inlineError && <p className="text-xs text-red-600">{inlineError}</p>}
          <div className="border-t border-arctic-200 pt-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-onix-400">Admin Shop Match</div>
              {currentAdminShopId && (
                <a
                  href={`https://app.repairwise.pro/admin/shops/${encodeURIComponent(currentAdminShopId)}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-700 hover:underline"
                >
                  Open current admin shop
                </a>
              )}
            </div>
            <div className="rounded border border-arctic-200 bg-arctic-50 p-2 text-xs text-onix-700">
              <div className="font-mono text-onix-600">{currentAdminShopId || 'No admin shop linked'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAdminMatchModal}
                className="rounded border border-arctic-300 px-2 py-1 text-xs text-onix-700 hover:bg-arctic-50"
              >
                Change Admin shop link
              </button>
              <button
                type="button"
                disabled={adminSaving || !currentAdminShopId}
                onClick={clearAdminShopId}
                className="rounded border border-arctic-300 px-2 py-1 text-xs text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            {adminFeedback && <div className="text-xs text-onix-600">{adminFeedback}</div>}
          </div>
          <div className="border-t border-arctic-200 pt-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-onix-400">Locations by this owner</div>
            <div className="space-y-1">
              {siblingLocations.map(loc => (
                <Link key={loc.id} href={`/shops/${loc.id}`} className="flex items-center justify-between rounded px-1 py-1 hover:bg-arctic-50">
                  <span className={`text-sm ${loc.id === shop.id ? 'font-semibold text-brand-700' : 'text-onix-900'}`}>{loc.name}</span>
                  <StatusBadge status={loc.status} />
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-arctic-200 bg-white">
            <div className="flex bg-arctic-50">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`border-r border-arctic-200 px-5 py-2 text-sm font-medium capitalize last:border-r-0 ${
                    tab === t
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-onix-600 hover:bg-arctic-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tab === 'activity' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="Add a note..." className="flex-1 rounded-lg border border-arctic-300 px-3 py-2 text-sm" />
                <button onClick={addNote} disabled={savingNote} className="rounded-lg bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">{savingNote ? '...' : 'Add'}</button>
              </div>
              <div className="space-y-2">
                {activityLog.length === 0 && <p className="text-sm text-onix-400">No activity yet.</p>}
                {activityLog.map((entry: any) => (
                  <div key={entry.id} className="rounded-lg border border-arctic-200 border-l-4 border-arctic-300 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold uppercase text-onix-800">{entry.type?.replace('_', ' ') ?? 'activity'}</span>
                      {entry.sent_by && <span className="text-xs text-onix-400">by {entry.sent_by}</span>}
                      <span className="ml-auto text-xs text-onix-400">{fmtDate(entry.created_at)}</span>
                    </div>
                    {entry.subject && <div className="text-sm font-medium text-onix-800">{entry.subject}</div>}
                    {entry.body && <div className="mt-1 whitespace-pre-wrap text-sm text-onix-700">{entry.body}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'contracts' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContractActionError(null)
                    setSendContractModalDraft(null)
                    setShowSendContractModal(true)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Send new contract
                </button>
              </div>
              {contracts.length === 0 && <p className="text-sm text-onix-500">No contracts linked to this shop yet.</p>}
              {contracts.map((contract: any) => (
                <div key={contract.id} className="rounded-lg border border-arctic-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{contract.counterparty_company || contract.counterparty_name || 'Contract'}</div>
                    <span className="rounded-full bg-arctic-100 px-2 py-0.5 text-xs font-medium text-onix-700">{contract.status}</span>
                  </div>
                  {contractDateSubline(contract)}
                  {contract.doc_url && <a href={contract.doc_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-brand-600 hover:underline">View document</a>}
                  {(contractAwaitingSignature(contract) || contractIsSentWithZohoRequest(contract)) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contractAwaitingSignature(contract) && (
                        <button
                          type="button"
                          onClick={() => remindContract(contract.id)}
                          disabled={remindingContractId === contract.id}
                          className="inline-flex items-center gap-1 rounded-md border border-arctic-300 bg-white px-3 py-1.5 text-xs font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-60"
                        >
                          {remindingContractId === contract.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Resend contract
                        </button>
                      )}
                      {contractIsSentWithZohoRequest(contract) && (
                        <button
                          type="button"
                          onClick={() => {
                            setContractActionError(null)
                            setReviseContractModal({
                              id: contract.id,
                              counterparty_name: contract.counterparty_name ?? '',
                              counterparty_email: contract.counterparty_email ?? '',
                            })
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Revise signer & resubmit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'programs' && (
            <div className="max-w-sm space-y-3">
              {PROGRAMS.map(program => (
                <div key={program.key} className="flex items-center justify-between">
                  <span className="w-36 text-sm font-medium">{program.label}</span>
                  <select value={programStatuses[program.key]} onChange={e => setProgramStatuses(ps => ({ ...ps, [program.key]: e.target.value }))} className="rounded border border-arctic-300 px-2 py-1 text-sm">
                    {PROGRAM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="w-36 text-sm font-medium">Operational Status</span>
                <span className="text-sm text-onix-700">
                  {operationalStatusLoading
                    ? 'Loading...'
                    : operationalStatus ?? '—'}
                </span>
              </div>
              <button onClick={savePrograms} disabled={savingPrograms} className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
                {savingPrograms ? 'Saving…' : 'Save Programs'}
              </button>
            </div>
          )}
        </section>
      </div>

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
          fromShopDetail
          onClose={() => setShowSendContractModal(false)}
          onSent={() => {
            setShowSendContractModal(false)
            router.refresh()
          }}
        />
      )}

      {reviseContractModal && (
        <ReviseSentContractModal
          key={reviseContractModal.id}
          locationId={shop.id}
          contractId={reviseContractModal.id}
          initialRecipientName={reviseContractModal.counterparty_name ?? ''}
          initialRecipientEmail={reviseContractModal.counterparty_email ?? ''}
          fromShopDetail
          onClose={() => setReviseContractModal(null)}
          onDone={() => {
            setReviseContractModal(null)
            router.refresh()
          }}
        />
      )}

      {showAdminMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-arctic-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-arctic-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-onix-900">Manual admin matching</h2>
                <p className="text-xs text-onix-500">Search by shop name or shop email and choose the correct admin shop.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminMatchModal(false)}
                className="rounded p-1 text-onix-500 hover:bg-arctic-100 hover:text-onix-800"
                aria-label="Close admin matching modal"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <input
                  value={adminSearch}
                  onChange={e => setAdminSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void searchAdminShops()
                    }
                  }}
                  placeholder="Search MotherDuck shops by name or email"
                  className="w-full rounded border border-arctic-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={adminSearching || adminSearch.trim().length < 2}
                  onClick={searchAdminShops}
                  className="rounded border border-arctic-300 px-3 py-2 text-sm text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
                >
                  {adminSearching ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {adminResults.length === 0 && (
                  <div className="rounded border border-dashed border-arctic-300 px-3 py-4 text-sm text-onix-500">
                    Search to load possible matches.
                  </div>
                )}
                {adminResults.map(result => (
                  <button
                    type="button"
                    key={`${result.id}:${result.motherduck_shop_id}`}
                    onClick={() => saveAdminShopResult(result.motherduck_shop_id, result.status)}
                    disabled={adminSaving}
                    className="block w-full rounded-lg border border-arctic-200 bg-white px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-onix-900">{result.name}</div>
                      <div className="font-mono text-xs text-onix-500">{result.motherduck_shop_id}</div>
                    </div>
                    <div className="mt-1 text-xs text-onix-600">{result.primary_contact_email ?? result.owner_email ?? 'No email'}</div>
                    <div className="mt-1 text-xs text-onix-500">
                      {[result.address_line1, result.city, result.state, result.postal_code].filter(Boolean).join(', ') || 'No address'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
