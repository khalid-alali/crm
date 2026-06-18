'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Ban,
  Check,
  ChevronRight,
  FileText,
  Info,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import DeleteShopButton from '@/components/DeleteShopButton'
import EmailModal from '@/components/EmailModal'
import SendContractModal, { type SendContractDraftPrefill } from '@/components/SendContractModal'
import { contractStatusBadgeClass, contractStatusLabel } from '@/lib/contract-status-display'
import AccountSelect from '@/components/AccountSelect'
import LocationContactsSection from '@/components/LocationContactsSection'
import ExpertAssistProgramPanel from '@/components/expert-assist/ExpertAssistProgramPanel'
import ExpertAssistShopPanel from '@/components/expert-assist/ExpertAssistShopPanel'
import type { ExpertAssistShopProgramView } from '@/lib/expert-assist-enrollments'
import { CapabilitiesSection } from '@/components/shop-detail/CapabilitiesSection'
import { pickFacilitySurvey } from '@/lib/shop-facility-survey'
import { pickCapabilityProfileState } from '@/lib/capability-profile'
import ActivityFeed from '@/components/ActivityFeed'
import StateSelect from '@/components/StateSelect'
import { BDR_ASSIGNEES, normalizeBdrAssignedTo } from '@/lib/bdr-assignees'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { LOCATION_SOURCES, formatLocationSource } from '@/lib/location-source'
import { getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'
import type { LeadEnrichmentPreviewResult } from '@/lib/google-places-enrichment'
import { DISQUALIFIED_REASON_LABELS, DISQUALIFIED_REASON_VALUES } from '@/lib/location-outcome-reasons'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import TaskRow from '@/components/tasks/TaskRow'
import type { TaskWithLocation } from '@/lib/types/task'
import { isTaskResolvedInLast30Days } from '@/lib/tasks/date-groups'
import { EXPERT_ASSIST_PROGRAM_ID, TESLA_PROGRAM_ID, VINFAST_PROGRAM_ID, getProgramConfig } from '@/lib/program-config'
import { teslaStageLabel } from '@/lib/program-stage'
import {
  buildVinfastChecklistMaps,
  evaluateVinfastPrerequisites,
  getVinfastEffectiveCompletedAt,
  rowForCanonicalKey,
  vinfastChecklistDefinitions,
  vinfastPhaseProgress,
  type VinfastCompletionContext,
} from '@/lib/vinfast-checklist'

const PROGRAM_CARD_CONFIG = [
  { key: 'vinfast', enrollmentKey: 'oem_warranty', programId: VINFAST_PROGRAM_ID, label: 'VinFast OEM' },
  { key: 'tesla', enrollmentKey: 'ev_program', programId: TESLA_PROGRAM_ID, label: 'Tesla / EV' },
  { key: 'multidrive', enrollmentKey: 'multi_drive', programId: 'multidrive', label: 'Multidrive' },
  { key: 'expert_assist', enrollmentKey: EXPERT_ASSIST_PROGRAM_ID, programId: EXPERT_ASSIST_PROGRAM_ID, label: 'Expert Assist' },
] as const

const EXPERT_ASSIST_PROGRESS_KEYS = [
  'card_on_file',
  'service_writer_setup_email_sent',
  'owner_forward_clicked',
  'counter_card_downloaded',
  'welcome_kit_shipped',
  'printout_photo_received',
] as const
const VINFAST_WELCOME_TEMPLATE_ID = '8bb8f454-fc68-448c-96d8-ea25049a66f8'
const VINFAST_IT_SETUP_TEMPLATE_ID = 'a4428cd1-9c51-459e-9819-d4d71bf52af3'
const STATUSES = ['lead', 'contacted', 'prospect', 'dormant', 'contracted', 'active', 'inactive']
const BASE_TABS = ['activity', 'tasks', 'contracts', 'programs', 'capabilities', 'expert-assist'] as const
type BaseTabKey = (typeof BASE_TABS)[number]
type TabKey = BaseTabKey | 'admin'
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
  currentUserEmail: string
  /** Server-derived: only khalid@repairwise.pro */
  allowContractDelete?: boolean
  expertAssistProgram?: ExpertAssistShopProgramView | null
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

type ShopStatusCachePayload = {
  max_jobs_per_day: number | null
  max_jobs_per_week: number | null
  is_active: boolean | null
  synced_at: string | null
}

type OwnerTag = 'fl' | 'vf' | 'shop'
type PhaseNumber = 1 | 2 | 3 | 4 | 5

type ChecklistRow = {
  item_key: string
  completed_at: string | null
  completed_by_user_id?: string | null
  notes?: string | null
}

type EnrollmentChecklistItem = {
  key: string
  label: string
  owner: OwnerTag
  phase: PhaseNumber
  phaseLabel: string
  order: number
  description?: string
  tooltip?: string
  actionLabel?: string
  completedAt: string | null
  completedBy: string | null
  blockedIncomplete: boolean
  waitingOn: string[]
  isVirtualComplete: boolean
}

type LegacyProgramEnrollment = {
  program: string
  status: string
  enrolled_at?: string | null
  updated_at?: string | null
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

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** `vf_go_live_week` from API → `YYYY-MM-DD` for `<input type="date" />`. */
function vfGoLiveToDateInputValue(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return ''
  const s = String(raw).trim()
  const ymd = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const t = Date.parse(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(t)) return ''
  return new Date(t).toISOString().slice(0, 10)
}

function ownerLabel(owner: OwnerTag): string {
  if (owner === 'vf') return 'VF'
  if (owner === 'shop') return 'Shop'
  return 'FL'
}

function ChecklistItemLabelWithTooltip({
  item,
  muted,
}: {
  item: EnrollmentChecklistItem
  muted?: boolean
}) {
  return (
    <div className={`text-sm ${muted ? 'text-onix-500' : 'text-onix-900'}`}>
      <span
        className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
          item.owner === 'fl'
            ? 'bg-brand-100 text-brand-700'
            : item.owner === 'vf'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {ownerLabel(item.owner)}
      </span>
      <span className="inline-flex items-center gap-1 align-middle">
        {item.label}
        {item.tooltip ? (
          <span className="group relative inline-flex align-middle">
            <button
              type="button"
              className="rounded p-0.5 text-onix-400 hover:bg-arctic-100 hover:text-onix-600"
              aria-label={`${item.label}: details`}
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-arctic-200 bg-white p-2.5 text-left text-xs font-normal normal-case leading-snug text-onix-700 shadow-lg group-hover:visible group-focus-within:visible whitespace-pre-line"
            >
              {item.tooltip}
            </span>
          </span>
        ) : null}
      </span>
    </div>
  )
}

/** `location_enrichment` from shop detail query (array or single row). */
function formatGoogleRatingFromEnrichment(shop: { location_enrichment?: unknown }): string {
  const raw = shop.location_enrichment
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row || typeof row !== 'object') return '—'
  const rating = (row as { google_rating?: unknown }).google_rating
  const count = (row as { google_review_count?: unknown }).google_review_count
  const ratingNum = rating != null && rating !== '' ? Number(rating) : NaN
  const countNum = count != null && count !== '' ? Number(count) : NaN
  const hasRating = Number.isFinite(ratingNum)
  const hasCount = Number.isFinite(countNum) && countNum >= 0
  if (!hasRating && !hasCount) return '—'
  if (hasRating && hasCount) {
    return `${ratingNum.toFixed(1)} ★ ${Math.trunc(countNum).toLocaleString('en-US')} reviews`
  }
  if (hasRating) return `${ratingNum.toFixed(1)} ★`
  return `${Math.trunc(countNum).toLocaleString('en-US')} reviews`
}

/** Calendar-day distance from `iso` to today (0 = same local day). */
export default function ShopDetailTabs({
  shop,
  siblingLocations,
  defaultTab,
  senderName,
  primaryContactDisplayName,
  primaryContactEmail,
  currentUserEmail,
  allowContractDelete = false,
  expertAssistProgram = null,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>(() => {
    const d = (defaultTab ?? 'activity').trim().toLowerCase()
    if (d === 'admin') return 'admin'
    if (d === 'activity') return 'activity'
    if (d === 'tasks' || d === 'contracts' || d === 'programs' || d === 'capabilities' || d === 'expert-assist') return d
    return 'activity'
  })
  const [status, setStatus] = useState(shop.status)
  const [operationalStatus, setOperationalStatus] = useState<string | null>(null)
  const [operationalStatusLoading, setOperationalStatusLoading] = useState(false)
  const [assignedTo, setAssignedTo] = useState(() => normalizeBdrAssignedTo(shop.assigned_to))
  const [selectedProgram, setSelectedProgram] = useState<(typeof PROGRAM_CARD_CONFIG)[number]['key']>('vinfast')
  const [autoCollapseDonePhases, setAutoCollapseDonePhases] = useState(true)
  const [showCompletedItems, setShowCompletedItems] = useState(false)
  const [phaseOpenOverrides, setPhaseOpenOverrides] = useState<Record<number, boolean>>({})
  const [phaseShowCompletedOverrides, setPhaseShowCompletedOverrides] = useState<Record<number, boolean>>({})
  const [phaseShowBlockedOverrides, setPhaseShowBlockedOverrides] = useState<Record<number, boolean>>({})
  const [editingTargetActivation, setEditingTargetActivation] = useState(false)
  const [targetActivationDraft, setTargetActivationDraft] = useState(() => vfGoLiveToDateInputValue(shop.vf_go_live_week))
  const [savingTargetActivation, setSavingTargetActivation] = useState(false)
  const [checklistBusyItem, setChecklistBusyItem] = useState<string | null>(null)
  const [enrollingProgram, setEnrollingProgram] = useState<string | null>(null)
  const [unenrollingVinfast, setUnenrollingVinfast] = useState(false)
  const [unenrollingTesla, setUnenrollingTesla] = useState(false)
  const [unenrollingExpertAssist, setUnenrollingExpertAssist] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [showVinfastWelcomeModal, setShowVinfastWelcomeModal] = useState(false)
  const [showVinfastItSetupModal, setShowVinfastItSetupModal] = useState(false)
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
  const [shopCacheLoading, setShopCacheLoading] = useState(false)
  const [shopCacheError, setShopCacheError] = useState<string | null>(null)
  const [shopCacheRow, setShopCacheRow] = useState<ShopStatusCachePayload | null>(null)
  const [enrichFeedback, setEnrichFeedback] = useState<string | null>(null)
  const [enrichModalOpen, setEnrichModalOpen] = useState(false)
  const [enrichPreviewLoading, setEnrichPreviewLoading] = useState(false)
  const [enrichPreviewData, setEnrichPreviewData] = useState<LeadEnrichmentPreviewResult | null>(null)
  const [enrichPreviewError, setEnrichPreviewError] = useState<string | null>(null)
  const [enrichConfirming, setEnrichConfirming] = useState(false)
  const [enrichUpdateShopName, setEnrichUpdateShopName] = useState(false)
  const enrichBusy = enrichPreviewLoading || enrichConfirming
  const [tasks, setTasks] = useState<TaskWithLocation[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithLocation | undefined>(undefined)
  const [showDoneTasks, setShowDoneTasks] = useState(false)
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
    legal_entity_name: shop.legal_entity_name ?? '',
    shop_type: (shop.shop_type as string | null) ?? '',
    shop_business_types: (Array.isArray(shop.shop_business_types)
      ? (shop.shop_business_types as string[])
      : []
    ).filter((t): t is 'repair_shop' | 'body_shop' => t === 'repair_shop' || t === 'body_shop'),
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
    setEnrichFeedback(null)
    setEnrichModalOpen(false)
    setEnrichPreviewData(null)
    setEnrichPreviewError(null)
    setEnrichPreviewLoading(false)
    setEnrichConfirming(false)
    setSelectedProgram('vinfast')
    setAutoCollapseDonePhases(true)
    setShowCompletedItems(false)
    setPhaseOpenOverrides({})
    setPhaseShowCompletedOverrides({})
  }, [
    shop.id,
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
    if (!editingTargetActivation) {
      setTargetActivationDraft(vfGoLiveToDateInputValue(shop.vf_go_live_week))
    }
  }, [shop.vf_go_live_week, editingTargetActivation])

  useEffect(() => {
    setCommercialDraft({
      legal_entity_name: shop.legal_entity_name ?? '',
      shop_type: (shop.shop_type as string | null) ?? '',
      shop_business_types: (Array.isArray(shop.shop_business_types)
        ? (shop.shop_business_types as string[])
        : []
      ).filter((t): t is 'repair_shop' | 'body_shop' => t === 'repair_shop' || t === 'body_shop'),
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
    shop.legal_entity_name,
    shop.shop_type,
    shop.shop_business_types,
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
    if (tab !== 'tasks') return
    let cancelled = false
    async function loadTasks() {
      setTasksLoading(true)
      setTasksError(null)
      try {
        const res = await fetch(`/api/tasks?location_id=${encodeURIComponent(shop.id)}`, { cache: 'no-store' })
        const data = (await res.json().catch(() => [])) as Array<TaskWithLocation> & { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setTasksError((data as { error?: string }).error ?? 'Could not load tasks')
          setTasks([])
          return
        }
        setTasks(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) {
          setTasksError('Could not load tasks')
          setTasks([])
        }
      } finally {
        if (!cancelled) setTasksLoading(false)
      }
    }
    void loadTasks()
    return () => {
      cancelled = true
    }
  }, [tab, shop.id])

  const hasAdminShopLink = useMemo(
    () => Boolean((currentAdminShopId || shop.motherduck_shop_id || '').trim()),
    [currentAdminShopId, shop.motherduck_shop_id],
  )

  const visibleTabs = useMemo((): TabKey[] => [...BASE_TABS, 'admin'], [])
  const legacyProgramByKey = useMemo(() => {
    const rows = (Array.isArray(shop.program_enrollments) ? shop.program_enrollments : []) as LegacyProgramEnrollment[]
    return new Map<string, LegacyProgramEnrollment>(rows.map(row => [String(row.program), row]))
  }, [shop.program_enrollments])
  const vinfastEnrollment = useMemo(() => {
    const rows = Array.isArray(shop.location_program_enrollments) ? shop.location_program_enrollments : []
    return rows.find((row: any) => row?.program_id === VINFAST_PROGRAM_ID && !row.unenrolled_at) ?? null
  }, [shop.location_program_enrollments])
  const teslaEnrollment = useMemo(() => {
    const rows = Array.isArray(shop.location_program_enrollments) ? shop.location_program_enrollments : []
    return rows.find((row: any) => row?.program_id === TESLA_PROGRAM_ID && !row.unenrolled_at) ?? null
  }, [shop.location_program_enrollments])
  const vinfastChecklistRows = useMemo((): ChecklistRow[] => {
    const rows = Array.isArray(vinfastEnrollment?.program_enrollment_checklist)
      ? vinfastEnrollment.program_enrollment_checklist
      : []
    return rows.map((row: any) => ({
      item_key: String(row.item_key ?? ''),
      completed_at: row.completed_at ?? null,
      completed_by_user_id: row.completed_by_user_id ?? null,
      notes: row.notes ?? null,
    }))
  }, [vinfastEnrollment])
  const teslaChecklistItems = useMemo(() => {
    const config = getProgramConfig(TESLA_PROGRAM_ID)
    const rows = Array.isArray(teslaEnrollment?.program_enrollment_checklist)
      ? teslaEnrollment.program_enrollment_checklist
      : []
    const rowsByKey = new Map<
      string,
      { completed_at: string | null; completed_by_user_id: string | null }
    >(
      rows.map((row: any) => [
        String(row.item_key ?? ''),
        {
          completed_at: row.completed_at ?? null,
          completed_by_user_id: row.completed_by_user_id ?? null,
        },
      ]),
    )
    return (config?.checklist ?? []).map(item => {
      const row = rowsByKey.get(item.key)
      return {
        key: item.key,
        label: item.label,
        completedAt: row?.completed_at ?? null,
        completedBy: row?.completed_by_user_id ?? null,
      }
    })
  }, [teslaEnrollment])
  const vinfastChecklistItems = useMemo((): EnrollmentChecklistItem[] => {
    const defs = vinfastChecklistDefinitions()
    const rowsByKey = new Map(vinfastChecklistRows.map(row => [row.item_key, row]))
    const ctx: VinfastCompletionContext = {
      rowsByKey,
      routablePaymentMethodCount: Number(shop.routable_payment_method_count ?? 0),
      vfGoLiveWeek: shop.vf_go_live_week ?? null,
      firstJobCompletedAt: vinfastEnrollment?.first_job_completed_at ?? null,
    }
    const { itemsByPhase, labelByKey } = buildVinfastChecklistMaps(defs)
    const completedAtByKey = new Map<string, string | null>()
    for (const def of defs) {
      completedAtByKey.set(def.key, getVinfastEffectiveCompletedAt(def.key, def, ctx))
    }
    const nowMs = Date.now()
    return defs
      .map(def => {
        const row = rowForCanonicalKey(def.key, rowsByKey)
        const completedAt = completedAtByKey.get(def.key) ?? null
        const { satisfied, waitingOn } = evaluateVinfastPrerequisites(
          def,
          def.prerequisites,
          completedAtByKey,
          itemsByPhase,
          labelByKey,
          nowMs,
        )
        const blockedIncomplete = !completedAt && !satisfied
        const isVirtualComplete =
          Boolean(completedAt) &&
          !row?.completed_at &&
          (def.key === 'routable_payout_method_linked' ||
            def.key === 'go_live_week_set' ||
            def.key === 'first_booking_received')
        let completedBy: string | null = row?.completed_by_user_id ?? null
        if (isVirtualComplete) completedBy = 'auto'
        return {
          key: def.key,
          label: def.label,
          owner: def.owner as OwnerTag,
          phase: def.phase as PhaseNumber,
          phaseLabel: def.phaseLabel as string,
          order: def.order ?? 999,
          description: def.description,
          tooltip: def.tooltip,
          actionLabel: def.actionLabel,
          completedAt,
          completedBy,
          blockedIncomplete,
          waitingOn,
          isVirtualComplete,
        }
      })
      .sort((a, b) => (a.phase === b.phase ? a.order - b.order : a.phase - b.phase))
  }, [
    shop.routable_payment_method_count,
    shop.vf_go_live_week,
    vinfastEnrollment,
    vinfastChecklistRows,
  ])
  const vinfastPhaseNumbers: PhaseNumber[] = [1, 2, 3, 4, 5]
  const vinfastPhases = useMemo(() => {
    return vinfastPhaseNumbers.map(phase => {
      const items = vinfastChecklistItems.filter(item => item.phase === phase)
      const showBlocked = phaseShowBlockedOverrides[phase] ?? false
      const { done, total } = vinfastPhaseProgress({
        phaseItems: items.map(i => ({
          completedAt: i.completedAt,
          blockedIncomplete: i.blockedIncomplete,
        })),
        showBlocked,
      })
      const allComplete = items.length > 0 && items.every(item => Boolean(item.completedAt))
      return {
        phase,
        title: items[0]?.phaseLabel ?? `Phase ${phase}`,
        items,
        done,
        total,
        allComplete,
        showBlocked,
      }
    })
  }, [vinfastChecklistItems, phaseShowBlockedOverrides])
  const activePhase = useMemo(() => {
    const next = vinfastPhases.find(phase => !phase.allComplete)
    return next?.phase ?? 5
  }, [vinfastPhases])
  const hasExpertAssistCardOnFile = Boolean(String(shop.consult_stripe_payment_method_id ?? '').trim())
  const expertAssistProgress = useMemo(() => {
    if (!expertAssistProgram) return { completed: 0, total: EXPERT_ASSIST_PROGRESS_KEYS.length + 3 }
    const checklistByKey = new Map(expertAssistProgram.checklist.map(item => [item.itemKey, item]))
    let completed = 0
    for (const key of EXPERT_ASSIST_PROGRESS_KEYS) {
      if (key === 'card_on_file') {
        if (hasExpertAssistCardOnFile || checklistByKey.get(key)?.completedAt) completed++
      } else if (checklistByKey.get(key)?.completedAt) {
        completed++
      }
    }
    if (expertAssistProgram.firstInboundSms) completed++
    if (expertAssistProgram.firstConsultComplete) completed++
    if (expertAssistProgram.secondConsultComplete) completed++
    return { completed, total: EXPERT_ASSIST_PROGRESS_KEYS.length + 3 }
  }, [expertAssistProgram, hasExpertAssistCardOnFile])

  const enrolledProgramsCount = useMemo(() => {
    return PROGRAM_CARD_CONFIG.filter(program => {
      if (program.key === 'vinfast') return Boolean(vinfastEnrollment)
      if (program.key === 'tesla') return Boolean(teslaEnrollment)
      if (program.key === 'expert_assist') return Boolean(expertAssistProgram)
      const enrollment = legacyProgramByKey.get(program.enrollmentKey)
      return enrollment && enrollment.status !== 'not_enrolled'
    }).length
  }, [expertAssistProgram, legacyProgramByKey, teslaEnrollment, vinfastEnrollment])
  const programCardStats = useMemo(() => {
    return PROGRAM_CARD_CONFIG.map(program => {
      const enrollment = legacyProgramByKey.get(program.enrollmentKey)
      const enrolled = Boolean(enrollment && enrollment.status !== 'not_enrolled')
      if (program.key === 'vinfast') {
        const total = vinfastChecklistItems.length
        const completed = vinfastChecklistItems.filter(item => item.completedAt).length
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        return {
          ...program,
          enrolled: Boolean(vinfastEnrollment),
          enrolledAt: vinfastEnrollment?.enrolled_at ?? vinfastEnrollment?.updated_at ?? null,
          completed,
          total,
          pct,
          statusBadge:
            !vinfastEnrollment ? null : completed >= total && total > 0 ? 'Active' : 'In progress',
        }
      }
      if (program.key === 'tesla') {
        const total = teslaChecklistItems.length
        const completed = teslaChecklistItems.filter(item => item.completedAt).length
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        const stage = String(teslaEnrollment?.stage ?? '')
        const statusBadge = !teslaEnrollment
          ? null
          : stage === 'active'
            ? 'Active'
            : stage === 'ready'
              ? 'Ready'
              : stage === 'disqualified'
                ? 'Disqualified'
                : 'In progress'
        return {
          ...program,
          enrolled: Boolean(teslaEnrollment),
          enrolledAt: teslaEnrollment?.enrolled_at ?? teslaEnrollment?.created_at ?? teslaEnrollment?.updated_at ?? null,
          completed,
          total,
          pct,
          statusBadge,
        }
      }
      if (program.key === 'expert_assist') {
        const { completed, total } = expertAssistProgress
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        const stage = expertAssistProgram?.stage
        return {
          ...program,
          enrolled: Boolean(expertAssistProgram),
          enrolledAt: expertAssistProgram?.enrolledAt ?? null,
          completed,
          total,
          pct,
          statusBadge:
            !expertAssistProgram ? null : stage === 'active' ? 'Active' : 'In progress',
        }
      }
      const total = 4
      const completed = enrolled ? (enrollment?.status === 'active' ? total : 1) : 0
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0
      return {
        ...program,
        enrolled,
        enrolledAt: enrollment?.enrolled_at ?? enrollment?.updated_at ?? null,
        completed,
        total,
        pct,
        statusBadge: !enrolled ? null : enrollment?.status === 'active' ? 'Active' : 'In progress',
      }
    })
  }, [expertAssistProgram, expertAssistProgress, legacyProgramByKey, teslaChecklistItems, teslaEnrollment, vinfastChecklistItems, vinfastEnrollment])
  const selectedProgramStats = useMemo(
    () => programCardStats.find(program => program.key === selectedProgram) ?? programCardStats[0],
    [programCardStats, selectedProgram],
  )

  useEffect(() => {
    if (tab !== 'admin') return
    if (!hasAdminShopLink) {
      setShopCacheLoading(false)
      setShopCacheError(null)
      setShopCacheRow(null)
      return
    }
    let cancelled = false
    async function loadShopCache() {
      setShopCacheLoading(true)
      setShopCacheError(null)
      try {
        const res = await fetch(`/api/locations/${shop.id}/shop-status-cache`, { cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as { error?: string; row?: ShopStatusCachePayload | null }
        if (cancelled) return
        if (!res.ok) {
          setShopCacheRow(null)
          setShopCacheError(typeof data.error === 'string' ? data.error : 'Could not load admin shop data')
          return
        }
        setShopCacheError(null)
        setShopCacheRow(data.row ?? null)
      } catch {
        if (!cancelled) {
          setShopCacheRow(null)
          setShopCacheError('Could not load admin shop data')
        }
      } finally {
        if (!cancelled) setShopCacheLoading(false)
      }
    }
    void loadShopCache()
    return () => {
      cancelled = true
    }
  }, [tab, hasAdminShopLink, shop.id])

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
  const openTasks = tasks
    .filter(task => task.status === 'open')
    .sort((a, b) => {
      const aDue = a.due_date ?? '9999-12-31'
      const bDue = b.due_date ?? '9999-12-31'
      if (aDue !== bDue) return aDue.localeCompare(bDue)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  const doneTasksRecent = tasks
    .filter(task => task.status === 'done' && isTaskResolvedInLast30Days(task))
    .sort((a, b) => new Date(b.resolved_at ?? b.updated_at).getTime() - new Date(a.resolved_at ?? a.updated_at).getTime())

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

  async function saveTargetActivation() {
    setSavingTargetActivation(true)
    try {
      const v = targetActivationDraft.trim()
      await patchShopJson({ vf_go_live_week: v === '' ? null : v })
      setEditingTargetActivation(false)
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not save target activation')
    } finally {
      setSavingTargetActivation(false)
    }
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

  async function enrollProgram(programKey: string) {
    setEnrollingProgram(programKey)
    try {
      if (programKey === VINFAST_PROGRAM_ID) {
        const res = await fetch('/api/vinfast/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: shop.id }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Could not enroll in VinFast')
      } else if (programKey === TESLA_PROGRAM_ID) {
        const res = await fetch('/api/tesla/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: shop.id }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Could not enroll in Tesla')
      } else if (programKey === EXPERT_ASSIST_PROGRAM_ID) {
        const res = await fetch('/api/expert-assist/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: shop.id }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Could not enroll in Expert Assist')
      } else {
        await fetch(`/api/locations/${shop.id}/programs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ program: programKey, status: 'pending_activation' }),
        })
      }
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not enroll program')
    } finally {
      setEnrollingProgram(null)
    }
  }

  async function unenrollExpertAssistProgram() {
    if (!expertAssistProgram?.id) return
    if (!window.confirm('Unenroll this shop from Expert Assist? Checklist history will be preserved.')) return
    const reasonInput = window.prompt('Optional reason for unenrollment (leave blank to skip):', '')
    const reason = reasonInput == null ? null : reasonInput.trim() || null

    setUnenrollingExpertAssist(true)
    try {
      const res = await fetch(`/api/expert-assist/enrollments/${expertAssistProgram.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not unenroll Expert Assist')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not unenroll Expert Assist')
    } finally {
      setUnenrollingExpertAssist(false)
    }
  }

  async function unenrollVinfastProgram() {
    if (!vinfastEnrollment?.id) return
    if (!window.confirm('Unenroll this shop from VinFast? Checklist history will be preserved.')) return
    const reasonInput = window.prompt('Optional reason for unenrollment (leave blank to skip):', '')
    const reason = reasonInput == null ? null : reasonInput.trim() || null

    setUnenrollingVinfast(true)
    try {
      const res = await fetch(`/api/vinfast/enrollments/${vinfastEnrollment.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not unenroll VinFast')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not unenroll VinFast')
    } finally {
      setUnenrollingVinfast(false)
    }
  }

  async function unenrollTeslaProgram() {
    if (!teslaEnrollment?.id) return
    if (!window.confirm('Unenroll this shop from Tesla? Checklist history will be preserved.')) return
    const reasonInput = window.prompt('Optional reason for unenrollment (leave blank to skip):', '')
    const reason = reasonInput == null ? null : reasonInput.trim() || null

    setUnenrollingTesla(true)
    try {
      const res = await fetch(`/api/tesla/enrollments/${teslaEnrollment.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not unenroll Tesla')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not unenroll Tesla')
    } finally {
      setUnenrollingTesla(false)
    }
  }

  async function toggleTeslaChecklistItem(itemKey: string, completed: boolean) {
    if (!teslaEnrollment?.id) return
    setChecklistBusyItem(itemKey)
    try {
      const res = await fetch(`/api/tesla/enrollments/${teslaEnrollment.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, completed }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not update checklist item')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not update checklist item')
    } finally {
      setChecklistBusyItem(null)
    }
  }

  async function toggleVinfastChecklistItem(item: EnrollmentChecklistItem, completed: boolean) {
    if (!vinfastEnrollment?.id) return
    setChecklistBusyItem(item.key)
    try {
      const res = await fetch(`/api/vinfast/enrollments/${vinfastEnrollment.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: item.key, completed }),
      })
      if (!res.ok) throw new Error('Could not update checklist item')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not update checklist item')
    } finally {
      setChecklistBusyItem(null)
    }
  }

  async function completeVinfastChecklistKey(itemKey: string) {
    if (!vinfastEnrollment?.id) return
    setChecklistBusyItem(itemKey)
    try {
      const res = await fetch(`/api/vinfast/enrollments/${vinfastEnrollment.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, completed: true }),
      })
      if (!res.ok) throw new Error('Could not update checklist item')
    } finally {
      setChecklistBusyItem(null)
    }
  }

  async function triggerQuickbooksAndRoutableAdd(itemKey: string) {
    if (!vinfastEnrollment?.id) return
    if (!hasAdminShopLink) {
      setTab('admin')
      openAdminMatchModal()
      window.alert('Admin shop is not linked yet. Link admin first, then run Add.')
      return
    }

    setChecklistBusyItem(itemKey)
    try {
      const res = await fetch(`/api/locations/${shop.id}/quickbooks-routable`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not trigger QuickBooks/Routable add')

      const checklistRes = await fetch(`/api/vinfast/enrollments/${vinfastEnrollment.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, completed: true }),
      })
      const checklistData = (await checklistRes.json().catch(() => ({}))) as { error?: string }
      if (!checklistRes.ok) {
        throw new Error(checklistData.error ?? 'Sent to Zapier, but failed to update checklist item')
      }

      router.refresh()
      window.alert('Sent to Zapier.')
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not trigger QuickBooks/Routable add')
    } finally {
      setChecklistBusyItem(null)
    }
  }

  async function resendRoutableInvite(itemKey: string) {
    setChecklistBusyItem(itemKey)
    try {
      const res = await fetch(`/api/locations/${shop.id}/routable-invite`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not resend Routable invite')
      router.refresh()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not resend Routable invite')
    } finally {
      setChecklistBusyItem(null)
    }
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

  function upsertTask(nextTask: TaskWithLocation) {
    setTasks(prev => {
      const existing = prev.find(t => t.id === nextTask.id)
      if (!existing) return [nextTask, ...prev]
      return prev.map(t => (t.id === nextTask.id ? { ...t, ...nextTask } : t))
    })
  }

  function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
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

  function enrichChangesForDisplay(
    data: Extract<LeadEnrichmentPreviewResult, { ok: true }>,
    updateShopName: boolean,
  ) {
    let changes = [...data.changes]
    if (data.canUpdateShopName && data.googlePlaceName) {
      changes = changes.filter(c => c.label !== 'Shop name')
      if (updateShopName) {
        changes.unshift({
          label: 'Shop name',
          before: data.currentShopName,
          after: data.googlePlaceName,
        })
      }
    }
    return changes
  }

  async function openEnrichModal() {
    if (inlineEdit === 'location') return
    setEnrichModalOpen(true)
    setEnrichPreviewData(null)
    setEnrichPreviewError(null)
    setEnrichUpdateShopName(false)
    setEnrichFeedback(null)
    setInlineError(null)
    setEnrichPreviewLoading(true)
    try {
      const res = await fetch(`/api/locations/${shop.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      })
      const data = (await res.json().catch(() => ({}))) as LeadEnrichmentPreviewResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not load preview')
      setEnrichPreviewData(data as LeadEnrichmentPreviewResult)
    } catch (e: unknown) {
      setEnrichPreviewError(e instanceof Error ? e.message : 'Could not load preview')
    } finally {
      setEnrichPreviewLoading(false)
    }
  }

  function closeEnrichModal() {
    if (enrichConfirming || enrichPreviewLoading) return
    setEnrichModalOpen(false)
    setEnrichPreviewData(null)
    setEnrichPreviewError(null)
    setEnrichUpdateShopName(false)
  }

  async function confirmEnrichFromModal() {
    setEnrichConfirming(true)
    setEnrichFeedback(null)
    setInlineError(null)
    try {
      const res = await fetch(`/api/locations/${shop.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateShopName: enrichUpdateShopName }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(data.error ?? 'Enrichment failed')
      setEnrichFeedback(data.message ?? 'Done.')
      setEnrichModalOpen(false)
      setEnrichPreviewData(null)
      setEnrichPreviewError(null)
      setEnrichUpdateShopName(false)
      router.refresh()
    } catch (e: unknown) {
      setEnrichPreviewError(e instanceof Error ? e.message : 'Enrichment failed')
    } finally {
      setEnrichConfirming(false)
    }
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
                <>
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-onix-500" aria-hidden />
                  <Link href={`/accounts/${shop.account_id}`} className="min-w-0 truncate text-brand-700 hover:underline">
                    {shop.accounts.business_name}
                  </Link>
                </>
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
            type="button"
            onClick={() => {
              setEditingTask(undefined)
              setShowTaskModal(true)
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-arctic-300 bg-white px-4 py-2 text-sm font-medium text-onix-900 hover:bg-arctic-50"
          >
            + New task
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
                  <label className="block text-[11px] font-medium text-onix-600">Legal entity name</label>
                  <input
                    type="text"
                    value={commercialDraft.legal_entity_name}
                    onChange={e => setCommercialDraft(d => ({ ...d, legal_entity_name: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-arctic-300 px-2 py-1 text-xs"
                  />
                </div>
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
                <div>
                  <span className="block text-[11px] font-medium text-onix-600">Business lines</span>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-onix-800">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={commercialDraft.shop_business_types.includes('repair_shop')}
                        onChange={() =>
                          setCommercialDraft(d => {
                            const has = d.shop_business_types.includes('repair_shop')
                            const next = has
                              ? d.shop_business_types.filter(x => x !== 'repair_shop')
                              : [...d.shop_business_types, 'repair_shop']
                            return { ...d, shop_business_types: next.sort() as ('repair_shop' | 'body_shop')[] }
                          })
                        }
                        className="rounded border-arctic-300"
                      />
                      Repair shop
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={commercialDraft.shop_business_types.includes('body_shop')}
                        onChange={() =>
                          setCommercialDraft(d => {
                            const has = d.shop_business_types.includes('body_shop')
                            const next = has
                              ? d.shop_business_types.filter(x => x !== 'body_shop')
                              : [...d.shop_business_types, 'body_shop']
                            return { ...d, shop_business_types: next.sort() as ('repair_shop' | 'body_shop')[] }
                          })
                        }
                        className="rounded border-arctic-300"
                      />
                      Body shop
                    </label>
                  </div>
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
                        legal_entity_name: commercialDraft.legal_entity_name.trim() || null,
                        shop_type: commercialDraft.shop_type === '' ? null : commercialDraft.shop_type,
                        shop_business_types:
                          commercialDraft.shop_business_types.length > 0
                            ? commercialDraft.shop_business_types
                            : null,
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
                        legal_entity_name: shop.legal_entity_name ?? '',
                        shop_type: (shop.shop_type as string | null) ?? '',
                        shop_business_types: (Array.isArray(shop.shop_business_types)
                          ? (shop.shop_business_types as string[])
                          : []
                        ).filter((t): t is 'repair_shop' | 'body_shop' => t === 'repair_shop' || t === 'body_shop'),
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
                  <dt className="text-onix-500">Legal entity name</dt>
                  <dd className="min-w-0 text-right">{shop.legal_entity_name?.trim() || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Type</dt>
                  <dd>{shop.shop_type === 'specialist' ? 'Specialist' : shop.shop_type === 'generalist' ? 'Generalist' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-onix-500">Business lines</dt>
                  <dd className="text-right">
                    {Array.isArray(shop.shop_business_types) && shop.shop_business_types.length > 0
                      ? (shop.shop_business_types as string[])
                          .map(t =>
                            t === 'repair_shop' ? 'Repair shop' : t === 'body_shop' ? 'Body shop' : t,
                          )
                          .join(' · ')
                      : '—'}
                  </dd>
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
                  <dt className="text-onix-500">Google rating</dt>
                  <dd className="min-w-0 text-right">{formatGoogleRatingFromEnrichment(shop)}</dd>
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
            <button
              type="button"
              onClick={() => void openEnrichModal()}
              disabled={enrichBusy || inlineEdit === 'location'}
              title="Enrich address and metadata from Google Places"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-onix-400 hover:bg-arctic-100 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enrichBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="sr-only">Enrich from Google Places</span>
            </button>
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
              {enrichFeedback ? (
                <div
                  className={`mt-1 text-xs ${
                    enrichFeedback.startsWith('Location updated')
                      ? 'text-emerald-700'
                      : enrichFeedback.includes('review') || enrichFeedback.includes('Supabase')
                        ? 'text-amber-700'
                        : 'text-red-600'
                  }`}
                >
                  {enrichFeedback}
                </div>
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
              {visibleTabs.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`border-r border-arctic-200 px-5 py-2 text-sm font-medium capitalize last:border-r-0 ${
                    tab === t
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-onix-600 hover:bg-arctic-100'
                  }`}
                >
                  {t === 'expert-assist' ? 'Expert Assist' : t}
                  {t === 'programs' ? (
                    <span
                      className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                        tab === t ? 'bg-brand-100 text-brand-800' : 'bg-arctic-100 text-onix-600'
                      }`}
                    >
                      {enrolledProgramsCount}
                    </span>
                  ) : null}
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

          {tab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-onix-900">Open ({openTasks.length})</h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(undefined)
                    setShowTaskModal(true)
                  }}
                  className="rounded-lg border border-arctic-300 bg-white px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50"
                >
                  + New task
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-arctic-200 bg-white">
                {tasksLoading ? (
                  <p className="px-4 py-3 text-sm text-onix-500">Loading tasks...</p>
                ) : tasksError ? (
                  <p className="px-4 py-3 text-sm text-red-600">{tasksError}</p>
                ) : openTasks.length === 0 && doneTasksRecent.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-onix-500">
                    <p>No tasks for this shop yet. Create one to track follow-ups.</p>
                  </div>
                ) : openTasks.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-onix-500">No open tasks.</p>
                ) : (
                  openTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      showLocation={false}
                      currentUserEmail={currentUserEmail}
                      onUpdate={updated => upsertTask({ ...(task as TaskWithLocation), ...updated })}
                      onDelete={removeTask}
                      onEdit={t => {
                        setEditingTask(t)
                        setShowTaskModal(true)
                      }}
                    />
                  ))
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-arctic-200 bg-white">
                <button
                  type="button"
                  onClick={() => setShowDoneTasks(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-onix-900">Done — last 30 days</span>
                  <span className="text-xs text-onix-500">{doneTasksRecent.length}</span>
                </button>
                {showDoneTasks && (
                  <>
                    {doneTasksRecent.length === 0 ? (
                      <p className="border-t border-arctic-200 px-4 py-3 text-sm text-onix-500">No recently done tasks.</p>
                    ) : (
                      doneTasksRecent.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          showLocation={false}
                          currentUserEmail={currentUserEmail}
                          onUpdate={updated => upsertTask({ ...(task as TaskWithLocation), ...updated })}
                          onDelete={removeTask}
                          onEdit={t => {
                            setEditingTask(t)
                            setShowTaskModal(true)
                          }}
                        />
                      ))
                    )}
                  </>
                )}
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
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {programCardStats.map(card => (
                  <div
                    key={card.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedProgram(card.key)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedProgram(card.key)
                      }
                    }}
                    className={`rounded-lg border p-4 text-left transition ${
                      selectedProgram === card.key
                        ? 'border-brand-500 bg-white shadow-[0_0_0_3px_rgba(99,91,255,0.10)]'
                        : 'border-arctic-200 bg-white hover:border-arctic-300'
                    } ${card.enrolled ? '' : 'opacity-55'}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-onix-900">{card.label}</p>
                        <p className="text-xs text-onix-500">
                          {card.enrolled ? `Enrolled · ${formatShortDate(card.enrolledAt)}` : 'Not enrolled'}
                        </p>
                      </div>
                      {card.enrolled ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                              card.statusBadge === 'Active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {card.statusBadge}
                          </span>
                          {card.key === 'vinfast' && selectedProgram === 'vinfast' && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                void unenrollVinfastProgram()
                              }}
                              disabled={unenrollingVinfast}
                              className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {unenrollingVinfast ? 'Unenrolling…' : 'Unenroll'}
                            </button>
                          )}
                          {card.key === 'tesla' && selectedProgram === 'tesla' && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                void unenrollTeslaProgram()
                              }}
                              disabled={unenrollingTesla}
                              className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {unenrollingTesla ? 'Unenrolling…' : 'Unenroll'}
                            </button>
                          )}
                          {card.key === 'expert_assist' && selectedProgram === 'expert_assist' && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                void unenrollExpertAssistProgram()
                              }}
                              disabled={unenrollingExpertAssist}
                              className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {unenrollingExpertAssist ? 'Unenrolling…' : 'Unenroll'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            void enrollProgram(card.programId)
                          }}
                          className="rounded border border-arctic-300 px-2 py-0.5 text-[11px] font-medium text-onix-700 hover:bg-arctic-50"
                        >
                          {enrollingProgram === card.programId ? 'Enrolling…' : '+ Enroll'}
                        </button>
                      )}
                    </div>
                    {card.enrolled ? (
                      <div className="flex items-center gap-2 text-xs text-onix-500">
                        <span>
                          {card.completed} / {card.total}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-arctic-100">
                          <span
                            className={`block h-full ${
                              card.statusBadge === 'Active' ? 'bg-emerald-600' : 'bg-brand-600'
                            }`}
                            style={{ width: `${card.pct}%` }}
                          />
                        </div>
                        <span>{card.pct}%</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-onix-700">
                  {selectedProgram === 'expert_assist'
                    ? 'Expert Assist Status'
                    : selectedProgram === 'tesla'
                      ? 'Tesla Status'
                      : 'VinFast Status'}
                </span>
                {selectedProgram === 'vinfast' ? (
                  <span className="text-onix-600">
                    {operationalStatusLoading ? 'Loading…' : operationalStatus ?? '—'}
                  </span>
                ) : selectedProgram === 'tesla' ? (
                  <span className="text-onix-600">
                    {teslaStageLabel(String(teslaEnrollment?.stage ?? '')) || '—'}
                  </span>
                ) : null}
              </div>

              {selectedProgram === 'expert_assist' && expertAssistProgram ? (
                <ExpertAssistProgramPanel
                  view={expertAssistProgram}
                  shopName={shop.name ?? 'Shop'}
                  ownerName={primaryContactDisplayName}
                  hasCardOnFile={hasExpertAssistCardOnFile}
                />
              ) : selectedProgram === 'expert_assist' ? (
                <div className="rounded-lg border border-arctic-200 bg-white p-4 text-sm text-onix-600">
                  Enroll this shop in Expert Assist to track activation funnel progress.
                </div>
              ) : selectedProgram === 'vinfast' ? (
                <div className="space-y-3 rounded-lg border border-arctic-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-onix-950">VinFast onboarding checklist</h3>
                      <p className="text-sm text-onix-500">
                        <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
                          <span>
                            {selectedProgramStats?.completed ?? 0} of {selectedProgramStats?.total ?? 0} complete ·
                            started {formatShortDate(selectedProgramStats?.enrolledAt ?? null)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden className="text-onix-400">
                              ·
                            </span>
                            <span className="font-medium text-onix-600">Target activation</span>
                            {editingTargetActivation ? (
                              <span className="inline-flex flex-wrap items-center gap-2">
                                <input
                                  type="date"
                                  value={targetActivationDraft}
                                  onChange={e => setTargetActivationDraft(e.target.value)}
                                  className="rounded border border-arctic-300 bg-white px-2 py-0.5 text-sm text-onix-900"
                                  title="Pick a date or type YYYY-MM-DD"
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveTargetActivation()}
                                  disabled={savingTargetActivation}
                                  className="rounded border border-arctic-300 bg-white px-2 py-0.5 text-xs font-medium text-onix-800 hover:bg-arctic-50 disabled:opacity-50"
                                >
                                  {savingTargetActivation ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTargetActivation(false)
                                    setTargetActivationDraft(vfGoLiveToDateInputValue(shop.vf_go_live_week))
                                  }}
                                  disabled={savingTargetActivation}
                                  className="rounded px-2 py-0.5 text-xs text-onix-600 hover:bg-arctic-50 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <span>{formatShortDate(shop.vf_go_live_week ?? null)}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTargetActivationDraft(vfGoLiveToDateInputValue(shop.vf_go_live_week))
                                    setEditingTargetActivation(true)
                                  }}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-onix-400 hover:bg-arctic-100 hover:text-onix-700"
                                  aria-label="Edit target activation date"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              </span>
                            )}
                          </span>
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-onix-600">
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={showCompletedItems}
                          onChange={e => setShowCompletedItems(e.target.checked)}
                        />
                        Show completed items
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-onix-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">FL</span>
                      Fixlane team
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">VF</span>
                      VinFast team
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Shop</span>
                      Shop owner
                    </span>
                  </div>

                  <div className="space-y-2">
                    {vinfastPhases.map(phase => {
                      const isDone = phase.allComplete
                      const isActive = !isDone && phase.phase === activePhase
                      const pct =
                        phase.total > 0 ? Math.min(100, Math.round((phase.done / phase.total) * 100)) : 0
                      const isExpanded =
                        !autoCollapseDonePhases ||
                        (isDone ? false : isActive) ||
                        phaseOpenOverrides[phase.phase] === true
                      const completedItems = phase.items.filter(item => Boolean(item.completedAt))
                      const visibleCompleted = showCompletedItems || phaseShowCompletedOverrides[phase.phase]
                      const blockedHiddenCount = phase.items.filter(
                        item => !item.completedAt && item.blockedIncomplete && !phase.showBlocked,
                      ).length

                      const visibleIncomplete = phase.items
                        .filter(item => {
                          if (item.completedAt) return false
                          if (item.blockedIncomplete && !phase.showBlocked) return false
                          return true
                        })
                        .sort((a, b) => a.order - b.order)

                      const completedSorted = (visibleCompleted ? completedItems : [])
                        .slice()
                        .sort((a, b) => a.order - b.order)

                      function renderActionCell(item: EnrollmentChecklistItem) {
                        if (item.key === 'routable_payout_method_linked') {
                          const hasRoutableId = Boolean(String(shop.routable_id ?? '').trim())
                          const pmCount = Number(shop.routable_payment_method_count ?? 0)
                          if (hasRoutableId && pmCount === 0) {
                            return (
                              <button
                                type="button"
                                disabled={checklistBusyItem === item.key}
                                onClick={() => void resendRoutableInvite(item.key)}
                                className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {checklistBusyItem === item.key ? 'Sending...' : 'Resend link'}
                              </button>
                            )
                          }
                          return <span className="text-xs text-onix-400">—</span>
                        }
                        if (!item.actionLabel) {
                          return <span className="text-xs text-onix-400">—</span>
                        }
                        if (
                          item.key === 'stock_parts_order_placed' ||
                          item.key === 'wall_charger_ordered'
                        ) {
                          return (
                            <a
                              href="https://app.repairwise.pro/admin/stock-orders"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 items-center rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              {item.actionLabel}
                            </a>
                          )
                        }
                        if (item.key === 'dsa_serial_logged') {
                          return (
                            <a
                              href="https://docs.google.com/spreadsheets/d/1CsHQuWR-xg6P-1bIgaIdA5-KGm9E-JJQe5Gl_soK-Qs/edit?pli=1&gid=2074238741#gid=2074238741"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 items-center rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              {item.actionLabel}
                            </a>
                          )
                        }
                        if (item.key === 'shop_activated') {
                          return hasAdminShopLink ? (
                            <a
                              href={`https://app.repairwise.pro/admin/shops/${encodeURIComponent(currentAdminShopId)}/edit`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 items-center rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              Open admin
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={openAdminMatchModal}
                              className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              Link admin
                            </button>
                          )
                        }
                        if (item.key === 'vf_email_sent') {
                          return (
                            <button
                              type="button"
                              onClick={() => setShowVinfastItSetupModal(true)}
                              className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              {item.actionLabel}
                            </button>
                          )
                        }
                        if (item.key === 'welcome_email_sent') {
                          return (
                            <button
                              type="button"
                              onClick={() => setShowVinfastWelcomeModal(true)}
                              className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                            >
                              {item.actionLabel}
                            </button>
                          )
                        }
                        if (item.key === 'add_shop_to_quickbooks_and_routable') {
                          return (
                            <button
                              type="button"
                              disabled={checklistBusyItem === item.key}
                              onClick={() => void triggerQuickbooksAndRoutableAdd(item.key)}
                              className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {checklistBusyItem === item.key ? 'Adding...' : item.actionLabel}
                            </button>
                          )
                        }
                        return (
                          <button
                            type="button"
                            className="h-6 rounded border border-arctic-300 px-2 text-xs text-onix-700 hover:bg-arctic-50"
                          >
                            {item.actionLabel}
                          </button>
                        )
                      }

                      return (
                        <div key={phase.phase} className="overflow-hidden rounded-lg border border-arctic-200">
                          <button
                            type="button"
                            onClick={() =>
                              setPhaseOpenOverrides(prev => ({ ...prev, [phase.phase]: !isExpanded }))
                            }
                            className="flex w-full items-center gap-3 bg-arctic-50 px-4 py-3 text-left"
                          >
                            <span
                              className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                                isDone
                                  ? 'bg-emerald-600 text-white'
                                  : isActive
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-arctic-100 text-onix-600'
                              }`}
                            >
                              {isDone ? '✓' : phase.phase}
                            </span>
                            <span className="flex-1 text-sm font-semibold text-onix-900">
                              Phase {phase.phase} · {phase.title}
                            </span>
                            <span className="h-1 w-[90px] overflow-hidden rounded bg-arctic-100">
                              <span
                                className={`block h-full ${isDone ? 'bg-emerald-600' : 'bg-brand-600'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="w-14 text-right text-xs text-onix-500">
                              {phase.done} / {phase.total}
                            </span>
                            <ChevronRight
                              className={`h-4 w-4 text-onix-500 transition ${isExpanded ? 'rotate-90' : ''}`}
                              aria-hidden
                            />
                          </button>
                          {isExpanded ? (
                            <div className="border-t border-arctic-200">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-arctic-100 px-4 py-2 text-xs text-onix-600">
                                <label className="inline-flex cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={phase.showBlocked}
                                    onChange={e =>
                                      setPhaseShowBlockedOverrides(prev => ({
                                        ...prev,
                                        [phase.phase]: e.target.checked,
                                      }))
                                    }
                                  />
                                  Show blocked items
                                  {blockedHiddenCount > 0 && !phase.showBlocked ? (
                                    <span className="text-onix-400">({blockedHiddenCount} hidden)</span>
                                  ) : null}
                                </label>
                              </div>
                              {!showCompletedItems && completedItems.length > 0 && !visibleCompleted ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPhaseShowCompletedOverrides(prev => ({ ...prev, [phase.phase]: true }))
                                  }
                                  className="w-full px-4 py-2 text-center text-xs text-brand-700 hover:bg-arctic-50"
                                >
                                  ↓ Show {completedItems.length} completed items
                                </button>
                              ) : null}

                              {completedSorted.map(item => (
                                <div
                                  key={item.key}
                                  className="grid grid-cols-[28px_1fr_auto] gap-2 border-t border-arctic-100 px-4 py-2.5 first:border-t-0"
                                >
                                  {item.isVirtualComplete ? (
                                    <span className="mt-0.5 grid h-[18px] w-[18px] place-items-center rounded border border-emerald-600 bg-emerald-600 text-xs text-white">
                                      ✓
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void toggleVinfastChecklistItem(item, false)}
                                      disabled={checklistBusyItem === item.key}
                                      className="mt-0.5 grid h-[18px] w-[18px] place-items-center rounded border border-emerald-600 bg-emerald-600 text-xs text-white"
                                    >
                                      ✓
                                    </button>
                                  )}
                                  <div>
                                    <ChecklistItemLabelWithTooltip item={item} muted />
                                    {item.description ? (
                                      <div className="text-xs text-onix-500">{item.description}</div>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-onix-500">
                                    {formatShortDate(item.completedAt)} · {item.completedBy ?? '—'}
                                  </div>
                                </div>
                              ))}

                              {visibleIncomplete.map(item => {
                                const routableSlot = item.key === 'routable_payout_method_linked'
                                const showDisabledBlocked = item.blockedIncomplete && phase.showBlocked
                                return (
                                  <div
                                    key={item.key}
                                    className={`grid grid-cols-[28px_1fr_auto] gap-2 border-t border-arctic-100 px-4 py-2.5 first:border-t-0 ${
                                      showDisabledBlocked ? 'opacity-70' : ''
                                    }`}
                                  >
                                    {routableSlot ? (
                                      <span className="mt-0.5 h-[18px] w-[18px] rounded border border-arctic-300 bg-arctic-50" />
                                    ) : showDisabledBlocked ? (
                                      <button
                                        type="button"
                                        disabled
                                        className="mt-0.5 h-[18px] w-[18px] cursor-not-allowed rounded border border-arctic-200 bg-arctic-100"
                                        aria-label="Blocked by prerequisites"
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => void toggleVinfastChecklistItem(item, true)}
                                        disabled={checklistBusyItem === item.key}
                                        className="mt-0.5 h-[18px] w-[18px] rounded border border-arctic-300 bg-white"
                                      />
                                    )}
                                    <div>
                                      <ChecklistItemLabelWithTooltip item={item} />
                                      {item.key === 'routable_payout_method_linked' &&
                                      shop.last_routable_link_sent_at ? (
                                        <div className="text-xs text-onix-500">
                                          Last link sent: {fmtDate(shop.last_routable_link_sent_at)}
                                        </div>
                                      ) : null}
                                      {item.description ? (
                                        <div className="text-xs text-onix-500">{item.description}</div>
                                      ) : null}
                                      {showDisabledBlocked && item.waitingOn.length > 0 ? (
                                        <div className="mt-1 text-xs text-amber-800">
                                          Waiting on: {item.waitingOn.join('; ')}
                                        </div>
                                      ) : null}
                                    </div>
                                    {renderActionCell(item)}
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : selectedProgram === 'tesla' ? (
                <div className="space-y-3 rounded-lg border border-arctic-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-onix-950">Tesla onboarding checklist</h3>
                      <p className="text-sm text-onix-500">
                        {selectedProgramStats?.completed ?? 0} of {selectedProgramStats?.total ?? 0} complete
                        {selectedProgramStats?.enrolledAt
                          ? ` · started ${formatShortDate(selectedProgramStats.enrolledAt)}`
                          : ''}
                      </p>
                    </div>
                    <Link
                      href="/tesla"
                      className="rounded border border-arctic-300 px-2.5 py-1 text-xs font-medium text-onix-700 hover:bg-arctic-50"
                    >
                      Open Tesla board
                    </Link>
                  </div>
                  {teslaEnrollment ? (
                    <div className="divide-y divide-arctic-100 rounded-lg border border-arctic-200">
                      {teslaChecklistItems.map(item => (
                        <div
                          key={item.key}
                          className="grid grid-cols-[28px_1fr_auto] gap-2 px-4 py-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => void toggleTeslaChecklistItem(item.key, !item.completedAt)}
                            disabled={checklistBusyItem === item.key}
                            className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded border text-xs ${
                              item.completedAt
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-arctic-300 bg-white'
                            }`}
                          >
                            {item.completedAt ? '✓' : ''}
                          </button>
                          <div className="text-sm text-onix-800">{item.label}</div>
                          <div className="text-xs text-onix-500">
                            {item.completedAt ? (
                              <>
                                {formatShortDate(item.completedAt)} · {item.completedBy ?? '—'}
                              </>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-onix-600">
                      Enroll this shop in Tesla to track onboarding progress on the kanban.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-arctic-200 bg-white p-4 text-sm text-onix-600">
                  {selectedProgramStats?.label} checklist is coming next. Use VinFast, Tesla, or Expert Assist for full onboarding.
                </div>
              )}
            </div>
          )}

          {tab === 'expert-assist' && (
            <div className="space-y-3">
              <ExpertAssistShopPanel locationId={shop.id} />
            </div>
          )}

          {tab === 'capabilities' && (
            <div className="space-y-3">
              <CapabilitiesSection
                locationId={shop.id}
                locationName={shop.name ?? 'Shop'}
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
                  capabilities_parking_spots_rw: shop.capabilities_parking_spots_rw ?? null,
                  capabilities_two_post_lifts: shop.capabilities_two_post_lifts ?? null,
                  capabilities_afterhours_tow_ins: shop.capabilities_afterhours_tow_ins ?? null,
                  capabilities_night_drops: shop.capabilities_night_drops ?? null,
                  capabilities_tires: shop.capabilities_tires ?? null,
                  capabilities_wheel_alignment: shop.capabilities_wheel_alignment ?? null,
                  capabilities_body_work: shop.capabilities_body_work ?? null,
                  capabilities_adas: shop.capabilities_adas ?? null,
                  capabilities_ac_work: shop.capabilities_ac_work ?? null,
                  capabilities_forklift: shop.capabilities_forklift ?? null,
                  capabilities_hv_battery_table: shop.capabilities_hv_battery_table ?? null,
                  capabilities_windshields: shop.capabilities_windshields ?? null,
                }}
                profile={pickCapabilityProfileState(shop)}
                techSurveys={Array.isArray(shop.tech_competency_surveys) ? shop.tech_competency_surveys : []}
                facilitySurvey={pickFacilitySurvey(shop.shop_facility_surveys)}
                onSendForm={sendCapabilitiesPortalLink}
              />
              {capabilitiesLinkFeedback && (
                <p className="text-sm text-onix-600" role="status">
                  {capabilitiesLinkFeedback}
                </p>
              )}
            </div>
          )}

          {tab === 'admin' && (
            <div className="max-w-2xl space-y-4">
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-[0.06em] text-onix-500">Admin Link</div>
                <div className="rounded-xl border border-arctic-200 bg-white p-3">
                  {hasAdminShopLink ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-onix-900">RepairWise admin</div>
                          <div className="mt-0.5 text-xs text-onix-500">shop_id · {currentAdminShopId}</div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            shopCacheRow?.is_active === false
                              ? 'bg-arctic-100 text-onix-600'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          Linked
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={openAdminMatchModal}
                          className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50"
                        >
                          Change link
                        </button>
                        <a
                          href={`https://app.repairwise.pro/admin/shops/${encodeURIComponent(currentAdminShopId)}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50"
                        >
                          Open admin ↗
                        </a>
                        <button
                          type="button"
                          disabled={adminSaving}
                          onClick={clearAdminShopId}
                          className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50 disabled:opacity-50"
                        >
                          Unlink
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 px-2 py-5 text-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-arctic-100 text-onix-500">
                        <Link2 className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="text-sm font-medium text-onix-900">No admin link</div>
                      <p className="max-w-sm text-sm text-onix-500">
                        This shop isn&apos;t linked to a RepairWise admin account. Jobs can&apos;t be dispatched until a link is set.
                      </p>
                      <button
                        type="button"
                        onClick={openAdminMatchModal}
                        className="rounded-lg border border-arctic-300 px-3 py-1.5 text-sm text-onix-800 hover:bg-arctic-50"
                      >
                        + Link admin account
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {hasAdminShopLink && (
                <>
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-[0.06em] text-onix-500">Availability</div>
                    <div className="rounded-xl border border-arctic-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-onix-700">Shop status</span>
                        {shopCacheLoading ? (
                          <span className="inline-flex items-center gap-1 text-onix-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Loading…
                          </span>
                        ) : shopCacheRow?.is_active === true ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            Active
                          </span>
                        ) : shopCacheRow?.is_active === false ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            Inactive
                          </span>
                        ) : (
                          <span className="text-onix-500">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-[0.06em] text-onix-500">Job Limits</div>
                    <div className="rounded-xl border border-arctic-200 bg-white p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-arctic-100 px-3 py-2">
                          <div className="text-xs text-onix-500">Max per day</div>
                          <div className="mt-1 text-3xl font-medium text-onix-900">
                            {shopCacheLoading ? '…' : shopCacheRow?.max_jobs_per_day ?? '—'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-arctic-100 px-3 py-2">
                          <div className="text-xs text-onix-500">Max per week</div>
                          <div className="mt-1 text-3xl font-medium text-onix-900">
                            {shopCacheLoading ? '…' : shopCacheRow?.max_jobs_per_week ?? '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {adminFeedback && <p className="text-sm text-onix-600">{adminFeedback}</p>}
              {shopCacheError && <p className="text-sm text-red-600">{shopCacheError}</p>}
            </div>
          )}
        </section>
      </div>

      {enrichModalOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!enrichConfirming && !enrichPreviewLoading) closeEnrichModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrich-modal-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-arctic-200 px-5 py-4">
              <h2 id="enrich-modal-title" className="text-base font-semibold text-onix-950">
                Enrich from Google Places
              </h2>
              <p className="mt-1 text-sm text-onix-600">
                We match this shop to Google&apos;s listing, then update CRM fields. Review what would change before saving.
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              {enrichPreviewLoading && (
                <div className="flex items-center gap-2 text-sm text-onix-600">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  Loading preview from Google…
                </div>
              )}
              {enrichPreviewError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{enrichPreviewError}</p>
              )}
              {!enrichPreviewLoading && enrichPreviewData && !enrichPreviewData.ok && (
                <p
                  className={`rounded-md border px-3 py-2 text-sm ${
                    enrichPreviewData.status === 'failed'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {enrichPreviewData.message}
                </p>
              )}
              {!enrichPreviewLoading && enrichPreviewData?.ok === true && (
                <>
                  {(enrichPreviewData.googlePlaceName || enrichPreviewData.googleFormattedAddress) && (
                    <div className="space-y-1 rounded-md border border-arctic-200 bg-arctic-50 px-3 py-2 text-xs text-onix-600">
                      {enrichPreviewData.googlePlaceName && (
                        <p>
                          <span className="font-medium text-onix-700">Matched Google name: </span>
                          {enrichPreviewData.googlePlaceName}
                        </p>
                      )}
                      {enrichPreviewData.googleFormattedAddress && (
                        <p>
                          <span className="font-medium text-onix-700">Matched Google address: </span>
                          {enrichPreviewData.googleFormattedAddress}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-onix-700">{enrichPreviewData.message}</p>
                  {enrichPreviewData.canUpdateShopName && enrichPreviewData.googlePlaceName && (
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-arctic-200 bg-white px-3 py-2 text-sm text-onix-700">
                      <input
                        type="checkbox"
                        checked={enrichUpdateShopName}
                        onChange={e => setEnrichUpdateShopName(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-arctic-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span>
                        Update shop name to matched Google name
                        <span className="mt-0.5 block text-xs text-onix-500">{enrichPreviewData.googlePlaceName}</span>
                      </span>
                    </label>
                  )}
                  {enrichChangesForDisplay(enrichPreviewData, enrichUpdateShopName).length === 0 ? (
                    <p className="text-sm text-onix-600">
                      No visible field changes. Confirming will still refresh Google metadata on this location.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-arctic-200">
                      <table className="w-full min-w-[280px] text-sm">
                        <thead>
                          <tr className="border-b border-arctic-200 bg-arctic-50 text-left text-xs font-medium uppercase tracking-wide text-onix-500">
                            <th className="px-3 py-2">Field</th>
                            <th className="px-3 py-2">Current</th>
                            <th className="px-3 py-2">After save</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrichChangesForDisplay(enrichPreviewData, enrichUpdateShopName).map((row, idx) => (
                            <tr key={idx} className="border-b border-arctic-100 last:border-0">
                              <td className="px-3 py-2 font-medium text-onix-900">{row.label}</td>
                              <td className="px-3 py-2 text-onix-600 whitespace-pre-wrap break-words max-w-[11rem]">{row.before}</td>
                              <td className="px-3 py-2 text-onix-950 whitespace-pre-wrap break-words max-w-[11rem]">{row.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {enrichPreviewData.notes.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-onix-600">
                      {enrichPreviewData.notes.map((note, nIdx) => (
                        <li key={nIdx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-arctic-200 px-5 py-3">
              <button
                type="button"
                disabled={enrichConfirming || enrichPreviewLoading}
                onClick={() => closeEnrichModal()}
                className="rounded-lg px-4 py-1.5 text-sm text-onix-600 hover:bg-arctic-100 disabled:opacity-50"
              >
                {enrichPreviewData && !enrichPreviewData.ok ? 'Close' : 'Cancel'}
              </button>
              {enrichPreviewData?.ok === true && (
                <button
                  type="button"
                  disabled={enrichConfirming || enrichPreviewLoading}
                  onClick={() => void confirmEnrichFromModal()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {enrichConfirming ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Confirm and save'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      {showTaskModal && (
        <TaskFormModal
          open={showTaskModal}
          onClose={() => {
            setShowTaskModal(false)
            setEditingTask(undefined)
          }}
          onSuccess={task => {
            upsertTask({
              ...(editingTask ?? { location: { id: shop.id, name: shop.name, chain_name: shop.chain_name ?? null } }),
              ...task,
              location: {
                id: shop.id,
                name: shop.name,
                chain_name: shop.chain_name ?? null,
                city: shop.city ?? null,
                state: shop.state ?? null,
              },
            })
          }}
          defaultLocationId={shop.id}
          defaultLocationLabel={shop.name}
          defaultLocationCity={shop.city ?? null}
          defaultLocationState={shop.state ?? null}
          taskToEdit={editingTask}
        />
      )}

      {showIntroModal && (
        <EmailModal
          locationId={shop.id}
          shopName={shop.name}
          contactName={primaryContactDisplayName}
          contactEmail={primaryContactEmail}
          senderName={senderName}
          accountId={shop.account_id ?? null}
          accountName={
            shop.accounts && typeof shop.accounts === 'object' && !Array.isArray(shop.accounts)
              ? (shop.accounts as { business_name?: string | null }).business_name?.trim() || null
              : Array.isArray(shop.accounts) && shop.accounts[0]
                ? String((shop.accounts[0] as { business_name?: string }).business_name ?? '').trim() || null
                : null
          }
          fromShopDetail
          onClose={() => setShowIntroModal(false)}
          onSent={() => {
            setShowIntroModal(false)
            router.refresh()
          }}
        />
      )}

      {showVinfastItSetupModal && (
        <EmailModal
          locationId={shop.id}
          shopName={shop.name}
          contactName={primaryContactDisplayName}
          contactEmail={primaryContactEmail}
          senderName={senderName}
          accountId={shop.account_id ?? null}
          accountName={
            shop.accounts && typeof shop.accounts === 'object' && !Array.isArray(shop.accounts)
              ? (shop.accounts as { business_name?: string | null }).business_name?.trim() || null
              : Array.isArray(shop.accounts) && shop.accounts[0]
                ? String((shop.accounts[0] as { business_name?: string }).business_name ?? '').trim() || null
                : null
          }
          initialTemplateId={VINFAST_IT_SETUP_TEMPLATE_ID}
          autoContinueFromInitialTemplate
          fromShopDetail
          onClose={() => setShowVinfastItSetupModal(false)}
          onSent={() => {
            void (async () => {
              try {
                await completeVinfastChecklistKey('vf_email_sent')
                setShowVinfastItSetupModal(false)
                router.refresh()
              } catch (e: unknown) {
                window.alert(e instanceof Error ? e.message : 'Could not update checklist item')
              }
            })()
          }}
        />
      )}

      {showVinfastWelcomeModal && (
        <EmailModal
          locationId={shop.id}
          shopName={shop.name}
          contactName={primaryContactDisplayName}
          contactEmail={primaryContactEmail}
          senderName={senderName}
          accountId={shop.account_id ?? null}
          accountName={
            shop.accounts && typeof shop.accounts === 'object' && !Array.isArray(shop.accounts)
              ? (shop.accounts as { business_name?: string | null }).business_name?.trim() || null
              : Array.isArray(shop.accounts) && shop.accounts[0]
                ? String((shop.accounts[0] as { business_name?: string }).business_name ?? '').trim() || null
                : null
          }
          initialTemplateId={VINFAST_WELCOME_TEMPLATE_ID}
          autoContinueFromInitialTemplate
          fromShopDetail
          onClose={() => setShowVinfastWelcomeModal(false)}
          onSent={() => {
            void (async () => {
              try {
                await completeVinfastChecklistKey('welcome_email_sent')
                setShowVinfastWelcomeModal(false)
                router.refresh()
              } catch (e: unknown) {
                window.alert(e instanceof Error ? e.message : 'Could not update checklist item')
              }
            })()
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
