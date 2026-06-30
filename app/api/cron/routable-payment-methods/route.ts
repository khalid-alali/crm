import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  ROUTABLE_LOCATION_SELECT,
  isRoutableBankLinked,
  shouldPollRoutableLocation,
  syncRoutableLocationFromApi,
  type RoutableLocationRow,
} from '@/lib/routable-bank-gate'
import { routableCredentialsFromEnv } from '@/lib/routable'

export const runtime = 'nodejs'

const BATCH_LIMIT = 50

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const expected = process.env.CRON_ROUTABLE_TOKEN?.trim() ?? ''
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const creds = routableCredentialsFromEnv()
  if (!creds) {
    return NextResponse.json(
      { error: 'Missing ROUTABLE_API_KEY or ROUTABLE_TEAM_MEMBER_ID.' },
      { status: 500 },
    )
  }

  const { data, error } = await supabaseAdmin
    .from('locations')
    .select(ROUTABLE_LOCATION_SELECT)
    .not('routable_id', 'is', null)
    .is('portal_unlocked_at', null)
    .order('pm_last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT * 3)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const nowMs = Date.now()
  const candidates = ((data ?? []) as RoutableLocationRow[])
    .filter(row => cleanText(row.routable_id))
    .filter(row => !isRoutableBankLinked(row))
    .filter(row => shouldPollRoutableLocation(row, nowMs))
    .slice(0, BATCH_LIMIT)

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

  const summary = {
    ok: true,
    scanned: candidates.length,
    updated: 0,
    linked_now: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  }

  for (const row of candidates) {
    const routableId = cleanText(row.routable_id)
    try {
      const result = await syncRoutableLocationFromApi(supabaseAdmin, row.id, creds, routableId, row)
      summary.updated += 1
      if (result.linkedNow) summary.linked_now += 1
    } catch (e) {
      summary.failed += 1
      summary.errors.push({
        id: row.id,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json(summary)
}
