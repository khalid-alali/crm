import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { listExpertAssistEnrollments } from '@/lib/expert-assist-enrollments'
import { enqueueExpertAssistStageSync } from '@/lib/expert-assist-funnel/trigger'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import { enrollLocationInProgram } from '@/lib/program-enrollment-service'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const enrollments = await listExpertAssistEnrollments(supabaseAdmin)
    return NextResponse.json({ enrollments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Expert Assist enrollments'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type EnrollBody = {
  location_id?: string
  location_ids?: string[]
}

export async function POST(req: Request) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: EnrollBody
  try {
    body = (await req.json()) as EnrollBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const locationIds = Array.from(
    new Set(
      [
        ...(Array.isArray(body.location_ids) ? body.location_ids : []),
        ...(body.location_id ? [body.location_id] : []),
      ]
        .map(v => String(v).trim())
        .filter(Boolean),
    ),
  )

  if (locationIds.length === 0) {
    return NextResponse.json({ error: 'Provide at least one location id' }, { status: 400 })
  }

  const actor = session.user?.email ?? null
  let created = 0
  let alreadyActive = 0
  const enrollmentIds: string[] = []

  for (const locationId of locationIds) {
    try {
      const result = await enrollLocationInProgram(supabaseAdmin, {
        locationId,
        programId: EXPERT_ASSIST_PROGRAM_ID,
        actorId: actor,
      })
      enrollmentIds.push(result.enrollmentId)
      try {
        await enqueueExpertAssistStageSync(locationId)
      } catch (triggerError) {
        console.error('expert-assist enrollments: stage sync enqueue failed', triggerError)
      }
      if (result.created) {
        created++
        await supabaseAdmin.from('activity_log').insert({
          location_id: locationId,
          type: 'note',
          body: 'Enrolled in Expert Assist activation funnel.',
          sent_by: actor ?? 'unknown',
        })
      } else {
        alreadyActive++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enrollment failed'
      return NextResponse.json({ error: message, location_id: locationId }, { status: 500 })
    }
  }

  revalidatePath('/consults')
  revalidatePath('/shops')
  return NextResponse.json({
    ok: true,
    created,
    already_active: alreadyActive,
    enrollment_ids: enrollmentIds,
  })
}
