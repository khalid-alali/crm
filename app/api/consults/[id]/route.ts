import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { decodeVinNhtsa } from '@/lib/expert-assist/vin-decode'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { supabaseAdmin } from '@/lib/supabase'
import type { ConsultOutcome } from '@/lib/expert-assist/types'
import { CONSULT_OUTCOMES_FILTER } from '@/lib/expert-assist/types'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: caseId } = await ctx.params
  const patch = (await req.json()) as {
    expert_notes?: string | null
    vin?: string | null
    year?: string | null
    model?: string | null
    trim?: string | null
    outcome?: string | null
  }

  const { data: c, error } = await supabaseAdmin.from('consult_cases').select('id, status').eq('id', caseId).maybeSingle()

  if (error || !c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const st = (c as { status: string }).status
  if (st === 'closed' || st === 'cancelled') {
    return NextResponse.json({ error: 'Case is not editable' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (patch.expert_notes !== undefined) update.expert_notes = patch.expert_notes

  if (patch.outcome !== undefined) {
    if (patch.outcome === null || patch.outcome === '') {
      update.outcome = null
    } else {
      if (!CONSULT_OUTCOMES_FILTER.includes(patch.outcome as ConsultOutcome)) {
        return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
      }
      update.outcome = patch.outcome
      await insertConsultCaseEvent({
        caseId,
        eventType: 'outcome_set',
        actorType: 'expert',
        actorId: session.user.email,
        metadata: { outcome: patch.outcome },
      })
    }
  }

  let vinDecode: { year: string | null; model: string | null; trim: string | null } | null = null
  if (patch.vin !== undefined) {
    const v = patch.vin?.trim().toUpperCase() || null
    update.vin = v
    if (v && v.length === 17) vinDecode = await decodeVinNhtsa(v)
    else vinDecode = { year: null, model: null, trim: null }
    if (patch.year === undefined) update.year = vinDecode?.year ?? null
    if (patch.model === undefined) update.model = vinDecode?.model ?? null
    if (patch.trim === undefined) update.trim = vinDecode?.trim ?? null
  }

  if (patch.year !== undefined) update.year = patch.year
  if (patch.model !== undefined) update.model = patch.model
  if (patch.trim !== undefined) update.trim = patch.trim

  const { error: upErr } = await supabaseAdmin.from('consult_cases').update(update).eq('id', caseId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  if (patch.expert_notes !== undefined) {
    await insertConsultCaseEvent({
      caseId,
      eventType: 'note_added',
      actorType: 'expert',
      actorId: session.user.email,
      metadata: { notes: true },
    })
  }

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)
  return NextResponse.json({ ok: true })
}
