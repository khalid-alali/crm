import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const BATCH_LIMIT = 50

type CandidateRow = {
  id: string
  routable_id: string | null
  routable_payment_method_count: number | null
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parsePaymentMethodCount(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length
  if (payload && typeof payload === 'object') {
    const results = (payload as { results?: unknown }).results
    if (Array.isArray(results)) return results.length
  }
  return 0
}

function paymentMethodsFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  }
  if (payload && typeof payload === 'object') {
    const results = (payload as { results?: unknown }).results
    if (Array.isArray(results)) {
      return results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    }
  }
  return []
}

function parseAccountLast4(payload: unknown): string | null {
  const methods = paymentMethodsFromPayload(payload)
  if (methods.length === 0) return null
  const first = methods[0]
  const candidates = [
    first.last4,
    first.account_last4,
    first.bank_account_last4,
  ]
  for (const value of candidates) {
    const raw = cleanText(value)
    if (raw) {
      const normalized = raw.replace(/\D/g, '').slice(-4)
      if (normalized.length === 4) return normalized
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_ROUTABLE_TOKEN?.trim() ?? ''
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const routableApiKey = cleanText(process.env.ROUTABLE_API_KEY)
  const teamMemberId = cleanText(process.env.ROUTABLE_TEAM_MEMBER_ID)
  if (!routableApiKey || !teamMemberId) {
    return NextResponse.json(
      { error: 'Missing ROUTABLE_API_KEY or ROUTABLE_TEAM_MEMBER_ID' },
      { status: 500 },
    )
  }

  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, routable_id, routable_payment_method_count')
    .not('routable_id', 'is', null)
    .eq('routable_payment_method_count', 0)
    .order('pm_last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const candidates = ((data ?? []) as CandidateRow[]).filter(row => cleanText(row.routable_id))
  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: 0,
      updated: 0,
      linked_now: 0,
      failed: 0,
      errors: [],
    })
  }

  const nowIso = new Date().toISOString()

  const settled = await Promise.allSettled(
    candidates.map(async row => {
      const routableId = cleanText(row.routable_id)
      const res = await fetch(`https://api.routable.com/v1/companies/${encodeURIComponent(routableId)}/payment-methods`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${routableApiKey}`,
          'X-Team-Member-Id': teamMemberId,
        },
      })
      if (!res.ok) throw new Error(`Routable HTTP ${res.status}`)
      const payload = (await res.json()) as unknown
      const count = parsePaymentMethodCount(payload)
      const accountLast4 = parseAccountLast4(payload)

      const { error: updateError } = await supabaseAdmin
        .from('locations')
        .update({
          routable_payment_method_count: count,
          routable_account_last4: accountLast4,
          pm_last_checked_at: nowIso,
        })
        .eq('id', row.id)
      if (updateError) throw new Error(updateError.message)

      const previousCount = Number(row.routable_payment_method_count ?? 0)
      const linkedNow = previousCount === 0 && count > 0
      if (linkedNow) {
        await supabaseAdmin.from('activity_log').insert({
          location_id: row.id,
          type: 'routable_bank_linked',
          subject: 'Routable payout method linked',
          body: `Detected ${count} Routable payment method${count === 1 ? '' : 's'}.`,
          sent_by: 'cron',
        })
      }

      return {
        id: row.id,
        count,
        linkedNow,
      }
    }),
  )

  const summary = {
    ok: true,
    scanned: candidates.length,
    updated: 0,
    linked_now: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  }

  settled.forEach((result, idx) => {
    const id = candidates[idx]?.id ?? 'unknown'
    if (result.status === 'fulfilled') {
      summary.updated += 1
      if (result.value.linkedNow) summary.linked_now += 1
      return
    }
    summary.failed += 1
    summary.errors.push({
      id,
      error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
    })
  })

  return NextResponse.json(summary)
}
