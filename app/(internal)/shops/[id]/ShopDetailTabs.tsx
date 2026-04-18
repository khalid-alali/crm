'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ban, Check, FileText, Loader2, Mail, Pencil, Trash2, X } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import DeleteShopButton from '@/components/DeleteShopButton'
import EmailModal from '@/components/EmailModal'
import SendContractModal, { type SendContractDraftPrefill } from '@/components/SendContractModal'
import { contractStatusBadgeClass, contractStatusLabel } from '@/lib/contract-status-display'
import AccountSelect from '@/components/AccountSelect'
import LocationContactsSection from '@/components/LocationContactsSection'
import { CapabilitiesSection } from '@/components/shop-detail/CapabilitiesSection'
import ActivityFeed from '@/components/ActivityFeed'
import StateSelect from '@/components/StateSelect'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { LOCATION_SOURCES, formatLocationSource } from '@/lib/location-source'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
import { DISQUALIFIED_REASON_LABELS, DISQUALIFIED_REASON_VALUES } from '@/lib/location-outcome-reasons'

const PROGRAMS = [
  { key: 'multi_drive', label: 'Multi-Drive' },
  { key: 'ev_program', label: 'EV Program' },
  { key: 'oem_warranty', label: 'OEM Warranty' },
]
const PROGRAM_STATUSES = ['not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated']
const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']
const TABS = ['activity', 'contracts', 'programs', 'capabilities'] as const
type TabKey = (typeof TABS)[number]
type EditField = 'name' | 'account' | 'location' | 'source' | 'notes' | 'commercial'

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
  primaryContactDisplayName: string
  primaryContactEmail: string
  /** Server-derived: only khalid@repairwise.pro */
  allowContractDelete?: boolean
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
  account_primary_name: string | null
  account_primary_email: string | null
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

function contractDateSubline(contract: { status?: string; signing_date?: string | null; zoho_sent_at?: string | null }) {
  if (contract.status === 'signed') {
    return <div className="mt-2 text-xs text-onix-600">Completed on: {fmtDate(contract.signing_date)}</div>
  }
  if (contract.status === 'sent' || contract.status === 'viewed') {
    return <div className="mt-2 text-xs text-onix-600">Sent: {fmtDate(contract.zoho_sent_at)}</div>
  }
  if (contract.status === 'revoked') {
    return <div className="mt-2 text-xs text-onix-600">Recalled in Zoho Sign (revoked)</div>
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

/** Calendar-day distance from `iso` to today (0 = same local day). */
export default function ShopDetailTabs({
  shop,
  siblingLocations,
  defaultTab,
  senderName,
  primaryContactDisplayName,
  primaryContactEmail,
  allowContractDelete = false,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>(
    defaultTab === 'contracts' || defaultTab === 'programs' || defaultTab === 'capabilities'
      ? defaultTab
      : 'activity',
  )
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
  const [remindSuccessContractId, setRemindSuccessContractId] = useState<string | null>(null)
  const remindSuccessClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [contractActionError, setContractActionError] = useState<string | null>(null)
  const [revokingContractId, setRevokingContractId] = useState<string | null>(null)
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)
  const [currentAdminShopId, setCurrentAdminShopId] = useState(shop.motherduck_shop_id ?? '')
  const [adminSaving, setAdminSaving] = useState(false)
  const [showAdminMatchModal, setShowAdminMatchModal] = useState(false)
  const [adminSearch, setAdminSearch] = useState('')
  const [adminSearching, setAdminSearching] = useState(false)
  const [adminResults, setAdminResults] = useState<AdminSearchResult[]>([])
  const [adminSearchCompleted, setAdminSearchCompleted] = useState(false)
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null)
  const [inlineEdit, setInlineEdit] = useState<EditField | null>(null)
  const [inlineSaving, setInlineSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [capabilitiesLinkFeedback, setCapabilitiesLinkFeedback] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState({
    name: shop.name ?? '',
    account_id: shop.account_id ?? null,
    address_line1: shop.address_line1 ?? '',
    city: shop.city ?? '',
    state: shop.state ?? '',
    postal_code: shop.postal_code ?? '',
    source: shop.source ?? '',
    notes: shop.notes ?? '',
  })
  const [commercialDraft, setCommercialDraft] = useState({
    shop_type: (shop.shop_type as string | null) ?? '',
    high_priority_target: Boolean(shop.high_priority_target),
    website: shop.website ?? '',
    standard_labor_rate:
      shop.standard_labor_rate != null && Number.isFinite(Number(shop.standard_labor_rate))
        ? String(shop.standard_labor_rate)
        : '',
    warranty_labor_rate:
      shop.warranty_labor_rate != null && Number.isFinite(Number(shop.warranty_labor_rate))
        ? String(shop.warranty_labor_rate)
        : '',
    note: shop.note ?? '',
  })
  const [dqReason, setDqReason] = useState(() => (shop.disqualified_reason as string | null) ?? '')
  const [dqNotes, setDqNotes] = useState(() => shop.disqualified_notes ?? '')
  const [dqSaving, setDqSaving] = useState(false)
  const [churnModalOpen, setChurnModalOpen] = useState(false)
  const [churnModalReason, setChurnModalReason] = useState('')
  const [churnModalNotes, setChurnModalNotes] = useState('')
  const [churnModalSaving, setChurnModalSaving] = useState(false)
  const locationPostalCodeError =
    inlineEdit === 'location' ? getPostalCodeError(inlineDraft.postal_code) : null

  useEffect(() => {
    setAssignedTo(normalizeBdrAssignedTo(shop.assigned_to))
    setStatus(shop.status)
    setCurrentAdminShopId(shop.motherduck_shop_id ?? '')
    setInlineDraft({
      name: shop.name ?? '',
      account_id: shop.account_id ?? null,
      address_line1: shop.address_line1 ?? '',
      city: shop.city ?? '',
      state: shop.state ?? '',
      postal_code: shop.postal_code ?? '',
      source: shop.source ?? '',
      notes: shop.notes ?? '',
    })
    setInlineEdit(null)
    setInlineError(null)
  }, [
    shop.assigned_to,
    shop.status,
    shop.motherduck_shop_id,
    shop.account_id,
    shop.name,
    shop.address_line1,
    shop.city,
    shop.state,
    shop.postal_code,
    shop.source,
    shop.notes,
  ])

  useEffect(() => {
    setCommercialDraft({
      shop_type: (shop.shop_type as string | null) ?? '',
      high_priority_target: Boolean(shop.high_priority_target),
      website: shop.website ?? '',
      standard_labor_rate:
        shop.standard_labor_rate != null && Number.isFinite(Number(shop.standard_labor_rate))
          ? String(shop.standard_labor_rate)
          : '',
      warranty_labor_rate:
        shop.warranty_labor_rate != null && Number.isFinite(Number(shop.warranty_labor_rate))
          ? String(shop.warranty_labor_rate)
          : '',
      note: shop.note ?? '',
    })
    setDqReason((shop.disqualified_reason as string | null) ?? '')
    setDqNotes(shop.disqualified_notes ?? '')
  }, [
    shop.shop_type,
    shop.high_priority_target,
    shop.website,
    shop.standard_labor_rate,
    shop.warranty_labor_rate,
    shop.note,
    shop.disqualified_reason,
    shop.disqualified_notes,
  ])

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

  useEffect(() => {
    return () => {
      if (remindSuccessClearTimer.current) clearTimeout(remindSuccessClearTimer.current)
    }
  }, [])

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
  const headerRevokeInFlight =
    Boolean(primarySentContract) && revokingContractId === primarySentContract?.id

  async function remindContract(contractId: string) {
    setContractActionError(null)
    if (remindSuccessClearTimer.current) {
      clearTimeout(remindSuccessClearTimer.current)
      remindSuccessClearTimer.current = null
    }
    setRemindSuccessContractId(null)
    setRemindingContractId(contractId)
    try {
      const res = await fetch(`/api/locations/${shop.id}/contracts/${contractId}/zoho-remind`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Reminder failed')
      setRemindSuccessContractId(contractId)
      remindSuccessClearTimer.current = setTimeout(() => {
        setRemindSuccessContractId(null)
        remindSuccessClearTimer.current = null
      }, 6000)
      router.refresh()
    } catch (e: unknown) {
      setContractActionError(e instanceof Error ? e.message : 'Reminder failed')
    } finally {
      setRemindingContractId(null)
    }
  }

  async function revokeContract(contractId: string) {
    if (
      !window.confirm(
        'Revoke this contract in Zoho Sign? The signer loses access to this envelope. You can send a new contract afterward.',
      )
    ) {
      return
    }
    setContractActionError(null)
    if (remindSuccessClearTimer.current) {
      clearTimeout(remindSuccessClearTimer.current)
      remindSuccessClearTimer.current = null
    }
    setRemindSuccessContractId(null)
    setRevokingContractId(contractId)
    try {
      const res = await fetch(`/api/locations/${shop.id}/contracts/${contractId}/zoho-revoke`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Revoke failed')
      router.refresh()
    } catch (e: unknown) {
      setContractActionError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setRevokingContractId(null)
    }
  }

  async function deleteContract(contractId: string, displayName: string) {
    if (
      !window.confirm(
        `Permanently delete “${displayName}” from the CRM? In-flight Zoho requests are recalled first. This cannot be undone.`,
      )
    ) {
      return
    }
    setContractActionError(null)
    if (remindSuccessClearTimer.current) {
      clearTimeout(remindSuccessClearTimer.current)
      remindSuccessClearTimer.current = null
    }
    setRemindSuccessContractId(null)
    setDeletingContractId(contractId)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Delete failed')
      router.refresh()
    } catch (e: unknown) {
      setContractActionError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingContractId(null)
    }
  }

  const activityLog = [...(shop.activity_log ?? [])].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  async function patchShopJson(payload: Record<string, unknown>) {
    const res = await fetch(`/api/locations/${shop.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Update failed')
    return data
  }

  async function handleStatusSelect(next: string) {
    if (next === status) return
    if (next === 'inactive' && status !== 'inactive') {
      setChurnModalReason('')
      setChurnModalNotes('')
      setChurnModalOpen(true)
      return
    }
    if (status === 'inactive' && next !== 'inactive') {
      if (
        !window.confirm(
          'Move this shop out of Churned? The disqualified reason, recorded date, and disqualified notes will be cleared.',
        )
      ) {
        return
      }
      try {
        await patchShopJson({ status: next })
        setStatus(next)
        setDqReason('')
        setDqNotes('')
        router.refresh()
      } catch (e: unknown) {
        window.alert(e instanceof Error ? e.message : 'Could not update status')
      }
      return
    }
    try {
      await patchShopJson({ status: next })
      setStatus(next)
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not update status')
    }
  }

  async function confirmChurnModal() {
    setChurnModalSaving(true)
    try {
      const payload: Record<string, unknown> = { status: 'inactive' }
      if (churnModalReason) payload.disqualified_reason = churnModalReason
      if (churnModalNotes.trim()) payload.disqualified_notes = churnModalNotes.trim()
      await patchShopJson(payload)
      setStatus('inactive')
      setDqReason(churnModalReason)
      setDqNotes(churnModalNotes.trim())
      setChurnModalOpen(false)
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not update status')
    } finally {
      setChurnModalSaving(false)
    }
  }

  async function saveDisqualifiedFields() {
    setDqSaving(true)
    try {
      await patchShopJson({
        disqualified_reason: dqReason || null,
        disqualified_notes: dqNotes.trim() || null,
      })
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setDqSaving(false)
    }
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
    setAdminSearchCompleted(false)
    setShowAdminMatchModal(true)
  }

  async function searchAdminShops() {
    const q = adminSearch.trim()
    if (q.length < 2) {
      setAdminResults([])
      setAdminSearchCompleted(false)
      return
    }
    setAdminSearching(true)
    setAdminFeedback(null)
    const res = await fetch(`/api/admin-shops/search?q=${encodeURIComponent(q)}`)
    const data = await res.json().catch(() => ({ results: [] }))
    if (!res.ok) {
      setAdminFeedback(data.error ?? 'Search failed')
      setAdminSearching(false)
      setAdminSearchCompleted(true)
      return
    }
    const raw = Array.isArray(data.results) ? data.results : []
    setAdminResults(
      [...raw].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    )
    setAdminSearching(false)
    setAdminSearchCompleted(true)
  }

  async function sendCapabilitiesPortalLink() {
    setCapabilitiesLinkFeedback(null)
    try {
      const res = await fetch('/api/portal/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: shop.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; portalUrl?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not create portal link')
      const portalUrl = data.portalUrl
      if (!portalUrl) throw new Error('Missing portal URL')
      await navigator.clipboard.writeText(portalUrl)
      await fetch(`/api/locations/${shop.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'Capabilities portal link generated and copied to clipboard.',
        }),
      })
      setCapabilitiesLinkFeedback('Link copied to clipboard.')
      router.refresh()
    } catch (e: unknown) {
      setCapabilitiesLinkFeedback(e instanceof Error ? e.message : 'Failed to copy link')
    }
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
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {inlineEdit === 'name' ? (
              <div className="flex min-w-0 w-full max-w-2xl flex-wrap items-center gap-2">
                <input
                  value={inlineDraft.name}
                  onChange={e => {
                    setInlineError(null)
                    setInlineDraft(d => ({ ...d, name: e.target.value }))
                  }}
                  className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-arctic-300 px-3 py-2 text-xl font-semibold text-onix-950"
                  aria-label="Shop name"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = inlineDraft.name.trim()
                    if (!n) {
                      setInlineError('Shop name is required')
                      return
                    }
                    void saveInline({ name: n })
                  }}
                  disabled={inlineSaving}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInlineEdit(null)
                    setInlineDraft(d => ({ ...d, name: shop.name ?? '' }))
                    setInlineError(null)
                  }}
                  className="rounded-lg border border-arctic-300 bg-white px-3 py-2 text-sm font-medium text-onix-800 hover:bg-arctic-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-[2rem] font-semibold tracking-tight text-onix-950">{shop.name}</h1>
                {editIcon('name')}
              </>
            )}
            <StatusBadge status={status} />
            {shop.chain_name && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{shop.chain_name}</span>}
          </div>
          {inlineEdit === 'account' ? (
            <div className="max-w-2xl space-y-2">
              <AccountSelect
                value={inlineDraft.account_id}
                onChange={accountId => setInlineDraft(d => ({ ...d, account_id: accountId }))}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => saveInline({ account_id: inlineDraft.account_id })}
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
              {inlineError && <p className="text-sm text-red-600">{inlineError}</p>}
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-onix-800">
              {shop.accounts?.business_name ? (
                <Link href={`/accounts/${shop.account_id}`} className="min-w-0 truncate text-brand-700 hover:underline">
                  {shop.accounts.business_name}
                </Link>
              ) : (
                <span className="text-onix-600">No account linked</span>
              )}
              {editIcon('account')}
            </div>
          )}
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
            disabled={headerRemindInFlight || headerRevokeInFlight}
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
      {inlineEdit === 'name' && inlineError && <p className="text-sm text-red-600">{inlineError}</p>}
      {contractActionError && <p className="text-sm text-red-600">{contractActionError}</p>}
      {remindSuccessContractId && (
        <p
          className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"
          role="status"
          aria-live="polite"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          Reminder sent — the signer will get another email from Zoho Sign.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:border-r lg:border-arctic-200 lg:pr-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-arctic-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-onix-400">Status</div>
              <div className="mt-1 text-xl font-semibold text-brand-700">{LOCATION_STATUS_LABELS[status]}</div>
              <select
                value={status}
                onChange={e => void handleStatusSelect(e.target.value)}
                className="mt-2 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {LOCATION_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {status === 'inactive' && (
                <div className="mt-3 space-y-2 border-t border-arctic-100 pt-3">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-onix-500">
                    Disqualified reason
                  </label>
                  <select
                    value={dqReason}
                    onChange={e => setDqReason(e.target.value)}
                    className="w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {DISQUALIFIED_REASON_VALUES.map(key => (
                      <option key={key} value={key}>
                        {DISQUALIFIED_REASON_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  {shop.disqualified_at && (
                    <p className="text-[11px] text-onix-500">
                      First recorded{' '}
                      {fmtDate(typeof shop.disqualified_at === 'string' ? shop.disqualified_at : null)}
                    </p>
                  )}
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-onix-500">
                    Disqualified notes <span className="font-normal text-onix-400">(optional)</span>
                  </label>
                  <textarea
                    value={dqNotes}
                    onChange={e => setDqNotes(e.target.value)}
                    rows={2}
                    placeholder="Context on why they churned…"
                    className="w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={dqSaving}
                    onClick={() => void saveDisqualifiedFields()}
                    className="w-full rounded bg-onix-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-onix-950 disabled:opacity-50"
                  >
                    {dqSaving ? 'Saving…' : 'Save disqualified details'}
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-arctic-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-onix-400">Last Activity</div>
              <div className="mt-2 inline-flex rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700">{activityBadge(activityLog[0]?.created_at)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-arctic-200 bg-white p-3">
            <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-onix-400">
              Shop profile
              {editIcon('commercial')}
            </div>
            {inlineEdit === 'commercial' ? (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-onix-600">Type</label>
                  <select
                    value={commercialDraft.shop_type}
                    onChange={e => setCommercialDraft(d => ({ ...d, shop_type: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    <option value="generalist">Generalist</option>
                    <option value="specialist">Specialist</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-onix-800">
                  <input
                    type="checkbox"
                    checked={commercialDraft.high_priority_target}
                    onChange={e => setCommercialDraft(d => ({ ...d, high_priority_target: e.target.checked }))}
                    className="rounded border-arctic-300"
                  />
                  High priority target
                </label>
                <div>
                  <label className="block text-[11px] font-medium text-onix-600">Website</label>
                  <input
                    type="url"
                    value={commercialDraft.website}
                    onChange={e => setCommercialDraft(d => ({ ...d, website: e.target.value }))}
                    placeholder="https://"
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-onix-600">Standard labor rate ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={commercialDraft.standard_labor_rate}
                    onChange={e => setCommercialDraft(d => ({ ...d, standard_labor_rate: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-onix-600">Warranty labor rate ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={commercialDraft.warranty_labor_rate}
                    onChange={e => setCommercialDraft(d => ({ ...d, warranty_labor_rate: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-onix-600">Note</label>
                  <textarea
                    value={commercialDraft.note}
                    onChange={e => setCommercialDraft(d => ({ ...d, note: e.target.value }))}
                    rows={2}
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={inlineSaving}
                    onClick={() => {
                      const stdRaw = commercialDraft.standard_labor_rate.trim()
                      const warRaw = commercialDraft.warranty_labor_rate.trim()
                      if (stdRaw !== '' && (!Number.isFinite(Number(stdRaw)) || Number(stdRaw) < 0)) {
                        setInlineError('Standard labor rate must be a valid non-negative number')
                        return
                      }
                      if (warRaw !== '' && (!Number.isFinite(Number(warRaw)) || Number(warRaw) < 0)) {
                        setInlineError('Warranty labor rate must be a valid non-negative number')
                        return
                      }
                      setInlineSaving(true)
                      setInlineError(null)
                      void patchShopJson({
                        shop_type: commercialDraft.shop_type === '' ? null : commercialDraft.shop_type,
                        high_priority_target: commercialDraft.high_priority_target,
                        website: commercialDraft.website.trim() || null,
                        standard_labor_rate: stdRaw === '' ? null : Number(stdRaw),
                        warranty_labor_rate: warRaw === '' ? null : Number(warRaw),
                        note: commercialDraft.note.trim() || null,
                      })
                        .then(() => {
                          setInlineEdit(null)
                          router.refresh()
                        })
                        .catch(e => setInlineError(e instanceof Error ? e.message : 'Failed to save'))
                        .finally(() => setInlineSaving(false))
                    }}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCommercialDraft({
                        shop_type: (shop.shop_type as string | null) ?? '',
                        high_priority_target: Boolean(shop.high_priority_target),
                        website: shop.website ?? '',
                        standard_labor_rate:
                          shop.standard_labor_rate != null && Number.isFinite(Number(shop.standard_labor_rate))
                            ? String(shop.standard_labor_rate)
                            : '',
                        warranty_labor_rate:
                          shop.warranty_labor_rate != null && Number.isFinite(Number(shop.warranty_labor_rate))
                            ? String(shop.warranty_labor_rate)
                            : '',
                        note: shop.note ?? '',
                      })
                      setInlineEdit(null)
                      setInlineError(null)
                    }}
                    className="rounded border border-arctic-300 px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
                {inlineError && <p className="text-xs text-red-600">{inlineError}</p>}
              </div>
            ) : (
              <dl className="mt-2 space-y-1.5 text-xs text-onix-800">
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Type</dt>
                  <dd>{shop.shop_type === 'specialist' ? 'Specialist' : shop.shop_type === 'generalist' ? 'Generalist' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">High priority</dt>
                  <dd>{shop.high_priority_target ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Website</dt>
                  <dd className="min-w-0 truncate text-right">
                    {shop.website ? (
                      <a
                        href={shop.website.startsWith('http') ? shop.website : `https://${shop.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        {shop.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Std labor</dt>
                  <dd>
                    {shop.standard_labor_rate != null && Number.isFinite(Number(shop.standard_labor_rate))
                      ? `$${Number(shop.standard_labor_rate)}`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Warranty labor</dt>
                  <dd>
                    {shop.warranty_labor_rate != null && Number.isFinite(Number(shop.warranty_labor_rate))
                      ? `$${Number(shop.warranty_labor_rate)}`
                      : '—'}
                  </dd>
                </div>
                <div className="border-t border-arctic-100 pt-1">
                  <dt className="text-onix-500">Note</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-onix-800">{shop.note || '—'}</dd>
                </div>
              </dl>
            )}
          </div>

          <LocationContactsSection
            accountId={shop.account_id ?? null}
            locationId={shop.id}
            locationOptions={siblingLocations.map(l => ({ id: l.id, name: l.name }))}
          />

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
                  inputMode="numeric"
                  maxLength={5}
                  className={`rounded px-2 py-1 text-sm sm:col-span-7 ${
                    locationPostalCodeError ? 'border border-red-400' : 'border border-arctic-300'
                  }`}
                />
              </div>
              {locationPostalCodeError && (
                <p className="text-xs text-red-600">{locationPostalCodeError}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (locationPostalCodeError) {
                    setInlineError(locationPostalCodeError)
                    return
                  }
                  void saveInline({
                    address_line1: inlineDraft.address_line1,
                    city: inlineDraft.city,
                    state: inlineDraft.state,
                    postal_code: normalizePostalCode(inlineDraft.postal_code),
                  })
                }}
                disabled={inlineSaving}
                className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="text-sm text-onix-800">
              {[shop.address_line1, [shop.city, shop.state].filter(Boolean).join(', '), shop.postal_code]
                .filter(Boolean)
                .join(' · ') || '—'}
              {shop.county ? (
                <div className="mt-0.5 text-xs text-onix-500">{shop.county}</div>
              ) : null}
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
          {inlineError && inlineEdit !== 'account' && <p className="text-xs text-red-600">{inlineError}</p>}
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
                  Open admin
                </a>
              )}
            </div>
            <div className="rounded border border-arctic-200 bg-arctic-50 p-2 text-xs text-onix-700">
              {currentAdminShopId ? 'Linked to RepairWise admin.' : 'No admin shop linked yet.'}
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
            <div className="mb-2 text-xs uppercase tracking-wide text-onix-400">Locations for this account</div>
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
              <ActivityFeed entries={activityLog} />
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${contractStatusBadgeClass(contract.status)}`}
                    >
                      {contractStatusLabel(contract.status)}
                    </span>
                  </div>
                  {contractDateSubline(contract)}
                  {contract.doc_url && <a href={contract.doc_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-brand-600 hover:underline">View document</a>}
                  {contractAwaitingSignature(contract) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => remindContract(contract.id)}
                        disabled={
                          remindingContractId === contract.id ||
                          revokingContractId === contract.id ||
                          deletingContractId === contract.id
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-arctic-300 bg-white px-3 py-1.5 text-xs font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-60"
                      >
                        {remindingContractId === contract.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Resend contract
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeContract(contract.id)}
                        disabled={
                          revokingContractId === contract.id ||
                          remindingContractId === contract.id ||
                          deletingContractId === contract.id
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
                      >
                        {revokingContractId === contract.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Ban className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Revoke in Zoho
                      </button>
                      {allowContractDelete && contract.status !== 'signed' && (
                        <button
                          type="button"
                          onClick={() =>
                            deleteContract(
                              contract.id,
                              contract.counterparty_company || contract.counterparty_name || 'Contract',
                            )
                          }
                          disabled={
                            deletingContractId === contract.id ||
                            remindingContractId === contract.id ||
                            revokingContractId === contract.id
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
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
                  )}
                  {allowContractDelete &&
                    contract.status !== 'signed' &&
                    !contractAwaitingSignature(contract) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            deleteContract(
                              contract.id,
                              contract.counterparty_company || contract.counterparty_name || 'Contract',
                            )
                          }
                          disabled={deletingContractId === contract.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deletingContractId === contract.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Delete
                        </button>
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
                <span className="w-36 text-sm font-medium">VinFast Status</span>
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

          {tab === 'capabilities' && (
            <div className="space-y-3">
              <CapabilitiesSection
                location={{
                  bar_license_number: shop.bar_license_number ?? null,
                  hours_of_operation: shop.hours_of_operation ?? null,
                  standard_warranty: shop.standard_warranty ?? null,
                  total_techs: shop.total_techs ?? null,
                  allocated_techs: shop.allocated_techs ?? null,
                  daily_appointment_capacity: shop.daily_appointment_capacity ?? null,
                  weekly_appointment_capacity: shop.weekly_appointment_capacity ?? null,
                  capabilities_submitted_at: shop.capabilities_submitted_at ?? null,
                  state: shop.state ?? null,
                }}
                onSendForm={sendCapabilitiesPortalLink}
              />
              {capabilitiesLinkFeedback && (
                <p className="text-sm text-onix-600" role="status">
                  {capabilitiesLinkFeedback}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {churnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-arctic-200 px-5 py-4">
              <h2 className="text-base font-semibold text-onix-950">Move to Churned</h2>
              <p className="mt-1 text-sm text-onix-600">
                Optional: capture why this shop left the pipeline. You can add or edit this later from the shop page.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="block text-xs font-medium text-onix-600">Disqualified reason</label>
                <select
                  value={churnModalReason}
                  onChange={e => setChurnModalReason(e.target.value)}
                  className="mt-1 w-full rounded border border-arctic-300 px-3 py-2 text-sm"
                >
                  <option value="">— Skip for now —</option>
                  {DISQUALIFIED_REASON_VALUES.map(key => (
                    <option key={key} value={key}>
                      {DISQUALIFIED_REASON_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-onix-600">Notes (optional)</label>
                <textarea
                  value={churnModalNotes}
                  onChange={e => setChurnModalNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-arctic-300 px-3 py-2 text-sm"
                  placeholder="Additional context…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-arctic-200 px-5 py-3">
              <button
                type="button"
                disabled={churnModalSaving}
                onClick={() => setChurnModalOpen(false)}
                className="rounded-lg px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={churnModalSaving}
                onClick={() => void confirmChurnModal()}
                className="rounded-lg bg-onix-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-onix-950 disabled:opacity-50"
              >
                {churnModalSaving ? 'Saving…' : 'Save as Churned'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIntroModal && (
        <EmailModal
          locationId={shop.id}
          shopName={shop.name}
          contactName={primaryContactDisplayName}
          contactEmail={primaryContactEmail}
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
          primaryContactName={primaryContactDisplayName}
          primaryContactEmail={primaryContactEmail}
          initialDraft={sendContractModalDraft}
          locationDefaultLaborRates={{
            standard:
              shop.standard_labor_rate != null && Number.isFinite(Number(shop.standard_labor_rate))
                ? Number(shop.standard_labor_rate)
                : null,
            warranty:
              shop.warranty_labor_rate != null && Number.isFinite(Number(shop.warranty_labor_rate))
                ? Number(shop.warranty_labor_rate)
                : null,
          }}
          fromShopDetail
          onClose={() => setShowSendContractModal(false)}
          onSent={() => {
            setShowSendContractModal(false)
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
                <p className="text-xs text-onix-500">
                  Search by shop or address text, then pick the matching admin shop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdminMatchModal(false)
                  setAdminSearchCompleted(false)
                }}
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
                  placeholder="Shop name, city, street, or ZIP"
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
                {adminResults.length === 0 && !adminSearchCompleted && (
                  <div className="rounded border border-dashed border-arctic-300 px-3 py-4 text-sm text-onix-500">
                    Search to load possible matches.
                  </div>
                )}
                {adminResults.length === 0 && adminSearchCompleted && (
                  <div className="rounded border border-dashed border-arctic-300 px-3 py-4 text-sm text-onix-500">
                    No matches for that search. Try a different shop name, city, street, or ZIP.
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
                    <div className="text-sm font-medium text-onix-900">{result.name}</div>
                    <div className="mt-1 text-xs text-onix-600">
                      {result.primary_contact_email ?? result.account_primary_email ?? 'No email'}
                    </div>
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
