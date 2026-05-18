import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { signExpertAssistShopToken } from '@/lib/expert-assist-shop-token'
import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'
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

  let token: string
  try {
    token = signExpertAssistShopToken(locationId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Token signing failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const base = expertAssistSurfacesBaseUrl(req)
  const inviteUrl = `${base}/s/${encodeURIComponent(token)}`

  return NextResponse.json({ token, inviteUrl })
}
