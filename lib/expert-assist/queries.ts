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
  await Promise.all([attachLatestMessages(merged), attachFirstInboundPreviews(merged)])
  return merged
}

async function attachFirstInboundPreviews(rows: ConsultQueueRow[]): Promise<void> {
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return

  const { data, error } = await supabaseAdmin.rpc('consult_first_inbound_preview_for_cases', { p_ids: ids })

  if (error) {
    console.warn('consult_first_inbound_preview_for_cases', error.message)
    return
  }

  const list = (data ?? []) as { case_id: string; body_preview: string }[]
  const map = new Map(list.map(d => [d.case_id, d.body_preview]))
  for (const r of rows) {
    r.first_inbound_preview = map.get(r.id) ?? null
  }
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

export type ConsultCaseShopContext = {
  consult_short_code: string | null
  consult_billing_email: string | null
  consult_stripe_card_last4: string | null
  prior_consult_count: number
  last_prior_consult_at: string | null
}

export async function fetchConsultCaseNeighbors(caseId: string): Promise<{
  prevId: string | null
  nextId: string | null
}> {
  const open = await fetchOpenCasesQueue()
  const ids = open.map(r => r.id)
  const idx = ids.indexOf(caseId)
  return {
    prevId: idx > 0 ? ids[idx - 1]! : null,
    nextId: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1]! : null,
  }
}

export async function fetchConsultCaseDetail(caseId: string): Promise<{
  case: ConsultQueueRow & {
    expert_notes: string | null
    outcome: string | null
    closed_at: string | null
    originating_contact_id: string | null
  }
  messages: ConsultMessageRow[]
  shopContext: ConsultCaseShopContext | null
} | null> {
  const { data: c, error } = await supabaseAdmin.from('consult_cases').select('*').eq('id', caseId).maybeSingle()

  if (error) throw error
  if (!c) return null

  const row = c as CaseRow
  const shopsById = new Map<string, { id: string; name: string }>()
  const contactsById = new Map<string, { display_name: string | null; phone_number: string; status: string }>()

  let shopContext: ConsultCaseShopContext | null = null
  if (row.shop_id) {
    const { data: shop } = await supabaseAdmin
      .from('locations')
      .select('id, name, consult_short_code, consult_billing_email, consult_stripe_card_last4')
      .eq('id', row.shop_id)
      .maybeSingle()
    if (shop) {
      shopsById.set(shop.id, { id: shop.id, name: shop.name })
      const { count, data: priorRows } = await supabaseAdmin
        .from('consult_cases')
        .select('created_at')
        .eq('shop_id', row.shop_id)
        .neq('id', caseId)
        .in('status', ['closed', 'billing_failed'])
        .order('created_at', { ascending: false })
        .limit(1)
      shopContext = {
        consult_short_code: (shop as { consult_short_code: string | null }).consult_short_code,
        consult_billing_email: (shop as { consult_billing_email: string | null }).consult_billing_email,
        consult_stripe_card_last4: (shop as { consult_stripe_card_last4: string | null }).consult_stripe_card_last4,
        prior_consult_count: count ?? 0,
        last_prior_consult_at: (priorRows?.[0] as { created_at: string } | undefined)?.created_at ?? null,
      }
    }
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
    shopContext,
  }
}
