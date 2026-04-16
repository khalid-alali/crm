import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

const STATUS_RANK: Record<string, number> = {
  lead: 0,
  contacted: 1,
  in_review: 2,
  contracted: 3,
  active: 4,
  inactive: 5,
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isBeforeActive(status: string | null | undefined): boolean {
  const rank = STATUS_RANK[status ?? '']
  const activeRank = STATUS_RANK.active
  return Number.isFinite(rank) && rank < activeRank
}

async function writeActivity(locationId: string, subject: string, body: string, sentBy: string) {
  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'admin_shop_match',
    subject,
    body,
    sent_by: sentBy,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const shopId = typeof body.motherduck_shop_id === 'string' ? body.motherduck_shop_id.trim() : ''
  const motherduckStatus = typeof body.motherduck_status === 'string' ? body.motherduck_status.trim().toLowerCase() : null
  if (!shopId) return NextResponse.json({ error: 'motherduck_shop_id is required' }, { status: 400 })
  if (!isUuid(shopId)) return NextResponse.json({ error: 'motherduck_shop_id must be a UUID' }, { status: 400 })

  const actor = session.user?.email ?? 'unknown'

  const { data: target, error: targetErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, status, motherduck_shop_id')
    .eq('id', id)
    .maybeSingle()
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  if (target.motherduck_shop_id === shopId) return NextResponse.json({ ok: true, movedFrom: null, unchanged: true })

  const { data: existingHolder, error: existingErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, status')
    .eq('motherduck_shop_id', shopId)
    .maybeSingle()
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const movedFrom = existingHolder && existingHolder.id !== target.id ? existingHolder : null

  if (movedFrom) {
    const { error: clearErr } = await supabaseAdmin
      .from('locations')
      .update({ motherduck_shop_id: null })
      .eq('id', movedFrom.id)
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })

    await writeActivity(
      movedFrom.id,
      'Admin shop id removed',
      `Admin shop id ${shopId} was moved to ${target.name}.`,
      actor,
    )
  }

  const motherduckIsActive = motherduckStatus === 'active' || movedFrom?.status === 'active'
  const shouldPromoteToActive = isBeforeActive(target.status) && motherduckIsActive
  const updatePatch: Record<string, string> = { motherduck_shop_id: shopId }
  if (shouldPromoteToActive) {
    updatePatch.status = 'active'
  }

  const { error: updateErr } = await supabaseAdmin
    .from('locations')
    .update(updatePatch)
    .eq('id', target.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await writeActivity(
    target.id,
    'Admin shop id set',
    `Admin shop id set to ${shopId}${movedFrom ? ` (moved from ${movedFrom.name}).` : '.'}`,
    actor,
  )
  if (shouldPromoteToActive) {
    await writeActivity(
      target.id,
      'Status auto-updated',
      `Status auto-updated to active after linking admin shop id ${shopId}.`,
      actor,
    )
  }

  return NextResponse.json({
    ok: true,
    movedFrom: movedFrom ? { id: movedFrom.id, name: movedFrom.name } : null,
    motherduck_shop_id: shopId,
    status_updated_to_active: shouldPromoteToActive,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actor = session.user?.email ?? 'unknown'

  const { data: target, error: targetErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, motherduck_shop_id')
    .eq('id', id)
    .maybeSingle()
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  if (!target.motherduck_shop_id) return NextResponse.json({ ok: true, cleared: false })

  const prev = target.motherduck_shop_id
  const { error: clearErr } = await supabaseAdmin
    .from('locations')
    .update({ motherduck_shop_id: null })
    .eq('id', target.id)
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })

  await writeActivity(target.id, 'Admin shop id removed', `Admin shop id ${prev} was cleared manually.`, actor)
  return NextResponse.json({ ok: true, cleared: true })
}
