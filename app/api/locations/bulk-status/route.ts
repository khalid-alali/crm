import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const ALLOWED_STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive'] as const
type PipelineStatus = (typeof ALLOWED_STATUSES)[number]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_IDS = 2500
const CHUNK = 150

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rec = body as Record<string, unknown>
  const statusRaw = rec.status
  const idsRaw = rec.ids

  if (typeof statusRaw !== 'string' || !ALLOWED_STATUSES.includes(statusRaw as PipelineStatus)) {
    return NextResponse.json({ error: 'Invalid or missing status' }, { status: 400 })
  }
  const nextStatus = statusRaw as PipelineStatus

  if (!Array.isArray(idsRaw)) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  }

  const idSet = new Set<string>()
  for (const v of idsRaw) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (!UUID_RE.test(t)) continue
    idSet.add(t)
    if (idSet.size >= MAX_IDS) break
  }

  const ids = [...idSet]
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No valid location ids' }, { status: 400 })
  }

  const found: { id: string; status: string }[] = []
  for (const part of chunk(ids, CHUNK)) {
    const { data, error } = await supabaseAdmin.from('locations').select('id, status').in('id', part)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      if (row && typeof row.id === 'string' && typeof row.status === 'string') {
        found.push({ id: row.id, status: row.status })
      }
    }
  }

  const toUpdate = found.filter(r => r.status !== nextStatus)
  const skippedAlready = found.length - toUpdate.length
  const notFound = ids.length - found.length

  if (toUpdate.length === 0) {
    revalidatePath('/shops')
    revalidatePath('/home')
    revalidatePath('/map')
    return NextResponse.json({
      updated: 0,
      skippedAlready,
      notFound,
    })
  }

  const sentBy = session.user?.email ?? 'unknown'
  const label = (s: string) => LOCATION_STATUS_LABELS[s] ?? s
  const logRows = toUpdate.map(r => ({
    location_id: r.id,
    type: 'status_change' as const,
    subject: 'Pipeline status (bulk)',
    body: `Bulk update: ${label(r.status)} → ${label(nextStatus)}`,
    sent_by: sentBy,
  }))

  for (const part of chunk(toUpdate.map(r => r.id), CHUNK)) {
    const { error: upErr } = await supabaseAdmin.from('locations').update({ status: nextStatus }).in('id', part)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  for (const part of chunk(logRows, 80)) {
    const { error: logErr } = await supabaseAdmin.from('activity_log').insert(part)
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })
  }

  revalidatePath('/shops')
  revalidatePath('/home')
  revalidatePath('/map')

  return NextResponse.json({
    updated: toUpdate.length,
    skippedAlready,
    notFound,
  })
}
