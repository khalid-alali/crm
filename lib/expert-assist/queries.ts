import { createConsultMediaSignedUrls } from '@/lib/expert-assist/storage'
import { supabaseAdmin } from '@/lib/supabase'
import type { ConsultCaseStatus, ConsultMessageRow, ConsultQueueRow } from '@/lib/expert-assist/types'

type CaseRow = {
  id: string
  status: ConsultCaseStatus
  created_at: string
  shop_id: string | null
  originating_phone_number: string
  originating_contact_id: string | null
  initial_question: string | null
  vin: string | null
  year: string | null
  model: string | null
  trim: string | null
  timer_started_at: string | null
  timer_stopped_at: string | null
  billable_seconds: number | null
  expert_notes: string | null
  outcome: string | null
  closed_at: string | null
  delivery_attention: boolean | null
}

function mergeQueueRows(
  cases: CaseRow[],
  shopsById: Map<string, { id: string; name: string }>,
  contactsById: Map<string, { display_name: string | null; phone_number: string; status: string }>
): ConsultQueueRow[] {
  return cases.map(c => ({
    id: c.id,
    status: c.status,
    created_at: c.created_at,
    originating_phone_number: c.originating_phone_number,
    initial_question: c.initial_question,
    shop_id: c.shop_id,
    vin: c.vin,
    year: c.year,
    model: c.model,
    trim: c.trim,
    timer_started_at: c.timer_started_at,
    timer_stopped_at: c.timer_stopped_at,
    billable_seconds: c.billable_seconds,
    delivery_attention: Boolean(c.delivery_attention),
    shop: c.shop_id ? shopsById.get(c.shop_id) ?? null : null,
    contact: c.originating_contact_id ? contactsById.get(c.originating_contact_id) ?? null : null,
  }))
}

async function loadCasesForStatuses(statuses: ConsultCaseStatus[]): Promise<ConsultQueueRow[]> {
  const { data, error } = await supabaseAdmin
    .from('consult_cases')
    .select('*')
    .in('status', statuses)
    /** Longest wait first = oldest created_at first for queue UX. */
    .order('created_at', { ascending: true })

  if (error) throw error
  const cases = (data ?? []) as CaseRow[]
  if (cases.length === 0) return []

  const shopIds = [...new Set(cases.map(c => c.shop_id).filter(Boolean))] as string[]
  const contactIds = [...new Set(cases.map(c => c.originating_contact_id).filter(Boolean))] as string[]

  const [shopsRes, contactsRes] = await Promise.all([
    shopIds.length
      ? supabaseAdmin.from('locations').select('id, name').in('id', shopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    contactIds.length
      ? supabaseAdmin
          .from('shop_approved_contacts')
          .select('id, display_name, phone_number, status')
          .in('id', contactIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; phone_number: string; status: string }[], error: null }),
  ])

  if (shopsRes.error) throw shopsRes.error
  if (contactsRes.error) throw contactsRes.error

  const shopsById = new Map((shopsRes.data ?? []).map(s => [s.id, s]))
  const contactsById = new Map((contactsRes.data ?? []).map(c => [c.id, c]))

  const merged = mergeQueueRows(cases, shopsById, contactsById)
  await attachLatestMessages(merged)
  return merged
}

async function attachLatestMessages(rows: ConsultQueueRow[]): Promise<void> {
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return

  const { data, error } = await supabaseAdmin.rpc('consult_latest_message_for_cases', { p_ids: ids })

  if (error) {
    console.warn('consult_latest_message_for_cases', error.message)
    return
  }

  const list = (data ?? []) as { case_id: string; direction: string; created_at: string }[]
  const map = new Map(list.map(d => [d.case_id, d]))
  for (const r of rows) {
    const m = map.get(r.id)
    r.last_message_direction = m?.direction ?? null
    r.last_message_at = m?.created_at ?? null
  }
}

/** Pending expert approval — oldest first in UX (sort in component or here). */
export async function fetchPendingApprovalQueue(): Promise<ConsultQueueRow[]> {
  const rows = await loadCasesForStatuses(['awaiting_expert_approval'])
  return rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

/** Open cases — sort by wait time desc in component. */
export async function fetchOpenCasesQueue(): Promise<ConsultQueueRow[]> {
  return loadCasesForStatuses(['open'])
}

export async function fetchConsultCaseDetail(caseId: string): Promise<{
  case: ConsultQueueRow & {
    expert_notes: string | null
    outcome: string | null
    closed_at: string | null
    originating_contact_id: string | null
  }
  messages: ConsultMessageRow[]
} | null> {
  const { data: c, error } = await supabaseAdmin.from('consult_cases').select('*').eq('id', caseId).maybeSingle()

  if (error) throw error
  if (!c) return null

  const row = c as CaseRow
  const shopsById = new Map<string, { id: string; name: string }>()
  const contactsById = new Map<string, { display_name: string | null; phone_number: string; status: string }>()

  if (row.shop_id) {
    const { data: shop } = await supabaseAdmin.from('locations').select('id, name').eq('id', row.shop_id).maybeSingle()
    if (shop) shopsById.set(shop.id, shop)
  }
  if (row.originating_contact_id) {
    const { data: contact } = await supabaseAdmin
      .from('shop_approved_contacts')
      .select('id, display_name, phone_number, status')
      .eq('id', row.originating_contact_id)
      .maybeSingle()
    if (contact) contactsById.set(contact.id, contact)
  }

  const [queueRow] = mergeQueueRows([row], shopsById, contactsById)

  const { data: messages, error: msgErr } = await supabaseAdmin
    .from('consult_messages')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })

  if (msgErr) throw msgErr

  const rawMessages = (messages ?? []) as ConsultMessageRow[]
  const paths = [
    ...new Set(
      rawMessages.flatMap(m => (m.media_urls ?? []).filter(u => u && !/^https?:\/\//i.test(u)))
    ),
  ]
  const signed = paths.length ? await createConsultMediaSignedUrls(paths, 7200) : new Map<string, string>()
  for (const m of rawMessages) {
    m.media_display_urls = (m.media_urls ?? []).map(u => (!u ? u : /^https?:\/\//i.test(u) ? u : signed.get(u) ?? u))
  }

  return {
    case: {
      ...queueRow,
      expert_notes: row.expert_notes,
      outcome: row.outcome,
      closed_at: row.closed_at,
      originating_contact_id: row.originating_contact_id,
    },
    messages: rawMessages,
  }
}
