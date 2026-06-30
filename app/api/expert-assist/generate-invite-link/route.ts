import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { expertAssistSurfacesPathShopId } from '@/lib/expert-assist-shop-token'
import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'
import { EXPERT_ASSIST_PROGRAM_ID } from '@/lib/program-config'
import { enrollLocationInProgram } from '@/lib/program-enrollment-service'
import { triggerInviteChase } from '@/lib/activation/trigger'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let locationId: string
  try {
    const body = await req.json()
    if (typeof body?.locationId !== 'string' || !body.locationId.trim()) {
      return NextResponse.json({ error: 'locationId required' }, { status: 400 })
    }
    locationId = body.locationId.trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data: loc, error } = await supabaseAdmin.from('locations').select('id').eq('id', locationId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!loc) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const now = new Date().toISOString()
  await supabaseAdmin
    .from('locations')
    .update({ consult_invited_at: now })
    .eq('id', locationId)
    .is('consult_invited_at', null)

  try {
    await enrollLocationInProgram(supabaseAdmin, {
      locationId,
      programId: EXPERT_ASSIST_PROGRAM_ID,
      actorId: session.user?.email ?? null,
    })
  } catch (enrollError) {
    console.error('expert-assist generate-invite-link enroll:', enrollError)
  }

  try {
    await triggerInviteChase(locationId)
  } catch (chaseError) {
    console.error('expert-assist generate-invite-link invite-chase:', chaseError)
  }

  revalidatePath('/consults')

  const pathShopId = expertAssistSurfacesPathShopId(locationId)
  const base = expertAssistSurfacesBaseUrl(req)
  const inviteUrl = `${base}/s/${encodeURIComponent(pathShopId)}`

  return NextResponse.json({ token: pathShopId, inviteUrl, locationId: pathShopId })
}
