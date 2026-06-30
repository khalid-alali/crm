import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { activationFieldForChecklistKey, isAutoResolvedExpertAssistChecklistKey } from '@/lib/activation/checklist'
import { ensureActivationState, getState, logShopEvent, sendOnce, writeFactIfNull } from '@/lib/activation/bindings'
import { sendWelcomeKitShippedEmail } from '@/lib/activation/lifecycle-emails'
import type { ActivationTimestampField } from '@/lib/activation/types'
import { getAppSession } from '@/lib/app-auth'
import { FREE_CONSULT_CHECKLIST_KEY } from '@/lib/expert-assist/free-consult'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import { supabaseAdmin } from '@/lib/supabase'

type ChecklistPatchBody = {
  item_key?: string
  completed?: boolean
  notes?: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid enrollment id' }, { status: 400 })

  let body: ChecklistPatchBody
  try {
    body = (await req.json()) as ChecklistPatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const itemKey = typeof body.item_key === 'string' ? body.item_key.trim().toLowerCase() : ''
  if (!itemKey) return NextResponse.json({ error: 'item_key is required' }, { status: 400 })

  const { data: enrollment, error: loadError } = await supabaseAdmin
    .from('location_program_enrollments')
    .select('id, location_id, program_id, unenrolled_at')
    .eq('id', id)
    .single()

  if (loadError || !enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  if (enrollment.program_id !== EXPERT_ASSIST_PROGRAM_ID) {
    return NextResponse.json({ error: 'Only Expert Assist enrollments are editable here' }, { status: 400 })
  }
  if (enrollment.unenrolled_at) {
    return NextResponse.json({ error: 'Enrollment is no longer active' }, { status: 400 })
  }

  if (itemKey === FREE_CONSULT_CHECKLIST_KEY) {
    return NextResponse.json(
      { error: 'Free consult used is set automatically when the first consult closes' },
      { status: 400 },
    )
  }

  if (isAutoResolvedExpertAssistChecklistKey(itemKey)) {
    return NextResponse.json(
      { error: `${itemKey} is set automatically from activation events` },
      { status: 400 },
    )
  }

  if (itemKey !== 'welcome_kit_shipped') {
    return NextResponse.json({ error: 'Unknown or non-manual checklist item' }, { status: 400 })
  }

  const completed = body.completed === true
  const completedAt = completed ? new Date().toISOString() : null
  const completedBy = completed ? (session.user?.email ?? null) : null
  const notes =
    body.notes === undefined ? undefined : body.notes == null ? null : String(body.notes).trim() || null

  const checklistPatch: Record<string, unknown> = {
    enrollment_id: id,
    item_key: itemKey,
    completed_at: completedAt,
    completed_by_user_id: completedBy,
    updated_at: new Date().toISOString(),
  }
  if (notes !== undefined) checklistPatch.notes = notes

  const { error: checklistError } = await supabaseAdmin
    .from('program_enrollment_checklist')
    .upsert(checklistPatch, { onConflict: 'enrollment_id,item_key' })

  if (checklistError) return NextResponse.json({ error: checklistError.message }, { status: 500 })

  const locationId = (enrollment as { location_id: string }).location_id
  const activationField = activationFieldForChecklistKey(itemKey)
  if (completed && activationField) {
    await ensureActivationState(locationId)
    await writeFactIfNull(locationId, activationField as ActivationTimestampField, completedAt!)
    await logShopEvent(locationId, 'kit.shipped', `manual:${completedAt}`, {})
    try {
      const ctx = await getState(locationId)
      const trackingUrl = notes?.trim() || undefined
      if (ctx) {
        await sendOnce(locationId, 'kit-1', () => sendWelcomeKitShippedEmail(ctx, trackingUrl))
      }
    } catch (kitEmailError) {
      console.error('welcome_kit_shipped: KIT-1 email failed', kitEmailError)
    }
  }

  const { data: updatedEnrollment, error: enrollmentUpdateError } = await supabaseAdmin
    .from('location_program_enrollments')
    .update({ last_touched_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (enrollmentUpdateError) return NextResponse.json({ error: enrollmentUpdateError.message }, { status: 500 })

  revalidatePath('/consults')
  revalidatePath('/shops')
  return NextResponse.json({ ok: true, enrollment: updatedEnrollment })
}
