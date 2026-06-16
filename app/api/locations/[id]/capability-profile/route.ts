import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import {
  isCapabilityProfileField,
  isValidCapabilityProfileValue,
} from '@/lib/capability-profile'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Record<string, unknown>
  const keys = Object.keys(body).filter(isCapabilityProfileField)

  if (keys.length !== 1) {
    return NextResponse.json(
      { error: 'Send exactly one capability profile field per request' },
      { status: 400 },
    )
  }

  const field = keys[0]
  if (!isCapabilityProfileField(field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  const value = body[field]
  if (!isValidCapabilityProfileValue(field, value)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const actor = session.user?.email ?? 'unknown'

  const { data, error } = await supabaseAdmin
    .from('locations')
    .update({
      [field]: value,
      profile_set_by: actor,
      profile_set_at: now,
    })
    .eq('id', id)
    .select(
      'eligibility, auto_depth, lv_depth, hv_depth, adas_depth, profile_set_by, profile_set_at',
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath(`/shops/${id}`)

  return NextResponse.json(data)
}
