import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { detectChain } from '@/lib/chain-detect'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'
import { normalizeBdrAssignedTo } from '@/lib/bdr-assignees'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // Never trust client-sent coordinates (avoids accidental null/NaN wipes via JSON).
  const { programStatuses, lat: _lat, lng: _lng, geocoded_at: _geocodedAt, ...fields } = body

  if ('assigned_to' in fields) {
    fields.assigned_to = normalizeBdrAssignedTo(
      typeof fields.assigned_to === 'string' ? fields.assigned_to : null,
    )
  }

  // Only auto-detect chain if name changed and chain_name not set
  if (fields.name && !fields.chain_name) {
    // Get current chain_name
    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('chain_name')
      .eq('id', params.id)
      .single()
    if (!existing?.chain_name) {
      fields.chain_name = detectChain(fields.name) ?? null
    }
  }

  // Geocode if address changed
  if (fields.address_line1 || fields.postal_code) {
    const { data: current } = await supabaseAdmin
      .from('locations')
      .select('address_line1, city, state, postal_code')
      .eq('id', params.id)
      .single()
    const merged = { ...current, ...fields }
    const coords = await geocodeAddress(merged)
    if (coords) {
      fields.lat = coords.lat
      fields.lng = coords.lng
      fields.geocoded_at = new Date().toISOString()
    }
  }

  const { data: location, error } = await supabaseAdmin
    .from('locations')
    .update(fields)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (programStatuses) {
    for (const [program, status] of Object.entries(programStatuses)) {
      await supabaseAdmin.from('program_enrollments').upsert({
        location_id: params.id,
        program,
        status,
      }, { onConflict: 'location_id,program' })
    }
  }

  return NextResponse.json(location)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin.from('locations').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
