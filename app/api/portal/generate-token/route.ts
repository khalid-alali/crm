import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { signCapabilitiesPortalToken } from '@/lib/portal-token'

function portalBaseUrl(req: NextRequest) {
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (env) return env
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}

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
    token = signCapabilitiesPortalToken(locationId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Token signing failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  const portalUrl = `${portalBaseUrl(req)}/portal/${token}`

  return NextResponse.json({ token, portalUrl })
}
