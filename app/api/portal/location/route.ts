import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { resolvePrimaryContact } from '@/lib/primary-contact'

const LOCATION_SELECT = [
  'id',
  'name',
  'state',
  'account_id',
  'bar_license_number',
  'hours_of_operation',
  'standard_warranty',
  'total_techs',
  'allocated_techs',
  'daily_appointment_capacity',
  'weekly_appointment_capacity',
  'capabilities_submitted_at',
  'capabilities_parking_spots_rw',
  'capabilities_two_post_lifts',
  'capabilities_afterhours_tow_ins',
  'capabilities_night_drops',
  'capabilities_tires',
  'capabilities_wheel_alignment',
  'capabilities_body_work',
  'capabilities_adas',
  'capabilities_ac_work',
  'capabilities_forklift',
  'capabilities_hv_battery_table',
  'capabilities_windshields',
].join(', ')

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  let locationId: string
  try {
    ;({ locationId } = verifyCapabilitiesPortalToken(token))
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .select(LOCATION_SELECT)
    .eq('id', locationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const primary = await resolvePrimaryContact(
    supabaseAdmin,
    (location as { account_id?: string | null }).account_id ?? null,
    locationId,
  )

  const loc = location as unknown as Record<string, unknown>

  return NextResponse.json({
    location: {
      ...loc,
      owner: {
        contact_id: primary?.id ?? null,
        contact_name: primary?.name ?? null,
        email: primary?.email ?? null,
        phone: primary?.phone ?? null,
      },
    },
  })
}
