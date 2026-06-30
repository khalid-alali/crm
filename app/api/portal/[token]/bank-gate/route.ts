import { NextRequest, NextResponse } from 'next/server'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { portalBaseUrl } from '@/lib/portal-base-url'
import {
  ROUTABLE_LOCATION_SELECT,
  snapshotFromLocation,
  startEmbeddedBankLinkFlow,
  syncRoutableLocationFromApi,
  type RoutableLocationRow,
} from '@/lib/routable-bank-gate'
import { routableCredentialsFromEnv } from '@/lib/routable'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function locationIdFromToken(token: string): string | null {
  try {
    return verifyCapabilitiesPortalToken(token).locationId
  } catch {
    return null
  }
}

async function loadLocation(locationId: string): Promise<RoutableLocationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select(ROUTABLE_LOCATION_SELECT)
    .eq('id', locationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as RoutableLocationRow | null) ?? null
}

function returningFromFlow(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get('bank_link') === 'return'
}

// GET /api/portal/[token]/bank-gate — current bank-link gate state for the enrollment portal.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  const location = await loadLocation(locationId)
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const creds = routableCredentialsFromEnv()
  const fromFlow = returningFromFlow(req)

  if (fromFlow && creds && !snapshotFromLocation(location).unlocked) {
    const companyId = location.routable_id?.trim()
    if (companyId) {
      try {
        await syncRoutableLocationFromApi(supabaseAdmin, locationId, creds, companyId, location)
        const refreshed = await loadLocation(locationId)
        if (refreshed) {
          return NextResponse.json({
            gate: snapshotFromLocation(refreshed, { returningFromFlow: true }),
          })
        }
      } catch (e) {
        console.warn('[bank-gate] redirect refresh failed', e)
      }
    }
  }

  return NextResponse.json({
    gate: snapshotFromLocation(location, { returningFromFlow: fromFlow }),
  })
}

// POST /api/portal/[token]/bank-gate — start embedded Routable flow or force a status refresh.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locationId = locationIdFromToken(token)
  if (!locationId) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })

  let body: { action?: string } = {}
  try {
    body = (await req.json()) as { action?: string }
  } catch {
    body = {}
  }
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'start'

  const location = await loadLocation(locationId)
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const creds = routableCredentialsFromEnv()
  if (!creds) return NextResponse.json({ error: 'Bank linking is temporarily unavailable.' }, { status: 503 })

  const snapshot = snapshotFromLocation(location)
  if (snapshot.unlocked) {
    return NextResponse.json({ gate: snapshot, already_unlocked: true })
  }

  const companyId = location.routable_id?.trim()
  if (!companyId) {
    return NextResponse.json(
      {
        error:
          'Your Fixlane account is still being set up on our end. We will email you when bank linking is ready.',
      },
      { status: 409 },
    )
  }

  if (action === 'refresh') {
    try {
      await syncRoutableLocationFromApi(supabaseAdmin, locationId, creds, companyId, location)
      const refreshed = await loadLocation(locationId)
      return NextResponse.json({ gate: snapshotFromLocation(refreshed ?? location) })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not refresh bank-link status'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  try {
    const result = await startEmbeddedBankLinkFlow({
      admin: supabaseAdmin,
      location,
      portalBaseUrl: portalBaseUrl(req),
      portalToken: token,
      creds,
    })
    return NextResponse.json({ gate: result.snapshot, external_flow_url: result.externalFlowUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not start bank linking'
    const status = message.includes('still being set up') ? 409 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
