import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import { upsertLocationShopContact } from '@/lib/contact-sync'
import {
  isPortalAutosaveContactKey,
  isPortalAutosaveLocationKey,
  locationColumnForAutosaveKey,
  validatePortalAutosaveField,
  type PortalAutosaveKey,
  type PortalAutosaveCtx,
} from '@/lib/portal-autosave'
import { parseBoundedNonNegInt, PORTAL_INT_MAX } from '@/lib/portal-capabilities-form'
import { stripPhoneToNationalDigits } from '@/lib/portal-phone-email'

function isCA(state: string | null | undefined) {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'CA' || s === 'CALIFORNIA'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const patchRaw = body.patch
  if (!patchRaw || typeof patchRaw !== 'object' || Array.isArray(patchRaw)) {
    return NextResponse.json({ error: 'patch object required' }, { status: 400 })
  }

  let locationId: string
  try {
    ;({ locationId } = verifyCapabilitiesPortalToken(token))
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  if ('capabilities_submitted_at' in patchRaw) {
    return NextResponse.json({ error: 'cannot autosave capabilities_submitted_at' }, { status: 400 })
  }

  const { data: loc, error: locErr } = await supabaseAdmin
    .from('locations')
    .select('id, state, account_id, capabilities_submitted_at, total_techs, allocated_techs')
    .eq('id', locationId)
    .maybeSingle()

  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 })
  if (!loc) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  if (loc.capabilities_submitted_at) {
    return NextResponse.json({ error: 'Form already submitted' }, { status: 409 })
  }

  const L = loc as Record<string, unknown>
  const ca = isCA(L.state as string | null | undefined)
  const patch = patchRaw as Record<string, unknown>

  const errors: Record<string, string> = {}
  const locationUpdate: Record<string, unknown> = {}
  const contactPatch: Partial<{ contact_name: string; contact_email: string; contact_phone: string }> = {}

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'token' || key === 'patch') continue
    if (!isPortalAutosaveLocationKey(key) && !isPortalAutosaveContactKey(key)) {
      errors[key] = 'Unknown field'
      continue
    }
    const pt = patch.total_techs
    const pa = patch.allocated_techs
    let mergeTot = String(L.total_techs ?? '')
    let mergeAlc = String(L.allocated_techs ?? '')
    if (key === 'total_techs') mergeTot = typeof value === 'string' ? value : String(value ?? '')
    else if (pt !== undefined) mergeTot = String(pt)
    if (key === 'allocated_techs') mergeAlc = typeof value === 'string' ? value : String(value ?? '')
    else if (pa !== undefined) mergeAlc = String(pa)

    const ctx: PortalAutosaveCtx = { isCA: ca, totalTechsInput: mergeTot, allocatedTechsInput: mergeAlc }
    const err = validatePortalAutosaveField(key as PortalAutosaveKey, value, ctx)
    if (err) {
      errors[key] = err
      continue
    }
    if (isPortalAutosaveLocationKey(key)) {
      const col = locationColumnForAutosaveKey(key)
      if (key === 'total_techs') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.total_techs)
      } else if (key === 'allocated_techs') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.allocated_techs)
      } else if (key === 'daily_appointment_capacity') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.daily_appointment_capacity)
      } else if (key === 'weekly_appointment_capacity') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.weekly_appointment_capacity)
      } else if (key === 'parking_spots_rw') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.parking_spots_rw)
      } else if (key === 'two_post_lifts') {
        locationUpdate[col] = parseBoundedNonNegInt(str(value), PORTAL_INT_MAX.two_post_lifts)
      } else if (key === 'bar_license_number') {
        const d = str(value).replace(/\D/g, '')
        locationUpdate[col] = d || null
      } else if (key === 'shop_name') {
        locationUpdate[col] = str(value)
      } else {
        locationUpdate[col] = str(value) || null
      }
    } else if (key === 'contact_name') {
      contactPatch.contact_name = str(value)
    } else if (key === 'contact_email') {
      contactPatch.contact_email = str(value)
    } else if (key === 'contact_phone') {
      const d = stripPhoneToNationalDigits(str(value))
      contactPatch.contact_phone = d.length === 10 ? d : ''
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  const hasLocation = Object.keys(locationUpdate).length > 0
  const hasContact = Object.keys(contactPatch).length > 0

  if (!hasLocation && !hasContact) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  if (hasLocation) {
    const { error: upErr } = await supabaseAdmin.from('locations').update(locationUpdate).eq('id', locationId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const accountId = (L.account_id as string | null | undefined) ?? null
  if (hasContact && accountId) {
    const primary = await resolvePrimaryContact(supabaseAdmin, accountId, locationId)
    const name = contactPatch.contact_name ?? primary?.name ?? ''
    const email = contactPatch.contact_email ?? primary?.email ?? ''
    const phone = contactPatch.contact_phone ?? primary?.phone ?? ''

    if (primary?.id) {
      const payload: Record<string, string | null> = {}
      if ('contact_name' in contactPatch) payload.name = name || null
      if ('contact_email' in contactPatch) payload.email = email || null
      if ('contact_phone' in contactPatch) payload.phone = phone.trim() ? phone : null
      if (Object.keys(payload).length > 0) {
        const { error: cErr } = await supabaseAdmin.from('contacts').update(payload).eq('id', primary.id)
        if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
      }
    } else {
      await upsertLocationShopContact(supabaseAdmin, {
        locationId,
        accountId,
        name,
        email,
        phone,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
