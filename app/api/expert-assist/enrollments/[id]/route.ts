import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { isExpertAssistFunnelStage } from '@/lib/expert-assist-funnel/stages'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import { unenrollEnrollment } from '@/lib/program-enrollment-service'
import { supabaseAdmin } from '@/lib/supabase'

type PatchBody = {
  stage?: string
  manual_stage_override?: boolean
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, location_id, program_id, stage, manual_stage_override, unenrolled_at')
    .eq('id', id)
    .single()

  if (loadError || !enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  if (enrollment.program_id !== EXPERT_ASSIST_PROGRAM_ID) {
    return NextResponse.json({ error: 'Only Expert Assist enrollments are editable here' }, { status: 400 })
  }
  if (enrollment.unenrolled_at) {
    return NextResponse.json({ error: 'Enrollment is no longer active' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    last_touched_at: new Date().toISOString(),
  }

  if (body.manual_stage_override !== undefined) {
    patch.manual_stage_override = Boolean(body.manual_stage_override)
  }

  if (body.stage !== undefined) {
    if (!isExpertAssistFunnelStage(body.stage)) {
      return NextResponse.json({ error: 'Invalid stage value' }, { status: 400 })
    }
    patch.stage = body.stage
    patch.manual_stage_override = true
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('location_program_enrollments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  revalidatePath('/consults')
  revalidatePath('/shops')
  return NextResponse.json(updated)
}

type UnenrollBody = {
  reason?: string | null
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let reason: string | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as UnenrollBody
    reason = body.reason == null ? null : String(body.reason).trim() || null
  } catch {
    reason = null
  }

  try {
    const updated = await unenrollEnrollment(supabaseAdmin, {
      enrollmentId: id,
      actorId: session.user?.email ?? null,
      reason,
    })
    await supabaseAdmin.from('activity_log').insert({
      location_id: updated.location_id,
      type: 'note',
      body: reason
        ? `Removed from Expert Assist activation funnel. Reason: ${reason}`
        : 'Removed from Expert Assist activation funnel.',
      sent_by: session.user?.email ?? 'unknown',
    })
    revalidatePath('/consults')
    revalidatePath('/shops')
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unenroll failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
