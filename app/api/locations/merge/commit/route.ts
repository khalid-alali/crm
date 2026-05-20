import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { commitLocationMerge } from '@/lib/location-merge/commit'
import type { MergeCommitBody } from '@/lib/location-merge/types'
import { supabaseAdmin } from '@/lib/supabase'

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
  const primaryId = typeof rec.primaryId === 'string' ? rec.primaryId.trim() : ''
  const secondaryId = typeof rec.secondaryId === 'string' ? rec.secondaryId.trim() : ''
  if (!primaryId || !secondaryId) {
    return NextResponse.json({ error: 'primaryId and secondaryId are required' }, { status: 400 })
  }

  const commitBody: MergeCommitBody = {
    primaryId,
    secondaryId,
    fieldOverrides:
      rec.fieldOverrides && typeof rec.fieldOverrides === 'object'
        ? (rec.fieldOverrides as Record<string, unknown>)
        : undefined,
    programOverrides: Array.isArray(rec.programOverrides)
      ? (rec.programOverrides as MergeCommitBody['programOverrides'])
      : undefined,
    legalEntityAcknowledged: rec.legalEntityAcknowledged === true,
    disqualifiedAcknowledged: rec.disqualifiedAcknowledged === true,
    previewSnapshot:
      rec.previewSnapshot && typeof rec.previewSnapshot === 'object'
        ? (rec.previewSnapshot as MergeCommitBody['previewSnapshot'])
        : undefined,
  }

  try {
    const actorEmail = session.user?.email ?? 'unknown'
    const [{ data: primaryBefore }, { data: secondaryBefore }] = await Promise.all([
      supabaseAdmin.from('locations').select('account_id').eq('id', primaryId).maybeSingle(),
      supabaseAdmin.from('locations').select('account_id').eq('id', secondaryId).maybeSingle(),
    ])
    const result = await commitLocationMerge(supabaseAdmin, commitBody, actorEmail)
    revalidatePath('/shops')
    revalidatePath('/home')
    revalidatePath('/map')
    revalidatePath('/tesla')
    revalidatePath('/vinfast')
    revalidatePath(`/shops/${result.locationId}`)
    for (const row of [primaryBefore, secondaryBefore]) {
      if (row?.account_id) revalidatePath(`/accounts/${row.account_id}`)
    }
    return NextResponse.json({ success: true, locationId: result.locationId })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Merge failed'
    const status =
      message.includes('changed since preview') || message.includes('Acknowledge') || message.includes('Confirm')
        ? 409
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}
