import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCapabilitiesPortalToken } from '@/lib/portal-token'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { resolvePrimaryContact } from '@/lib/primary-contact'
import { upsertLocationShopContact } from '@/lib/contact-sync'
import {
  AC_VALUES,
  ALIGNMENT_VALUES,
  fmtPortalLogValue,
  isMember,
  isYesNo,
  THREE_TIER,
  TIRES_VALUES,
  YES_NO,
} from '@/lib/portal-capabilities-schema'
import { validatePortalEmail, validateUsPhoneOptional, stripPhoneToNationalDigits } from '@/lib/portal-phone-email'
import { tryParsePortalHoursJson, validatePortalHoursModel } from '@/lib/portal-hours-schedule'
import { parseBoundedNonNegInt, PORTAL_INT_MAX } from '@/lib/portal-capabilities-form'

function isCA(state: string | null | undefined) {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'CA' || s === 'CALIFORNIA'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

async function insertPortalNote(locationId: string, body: string) {
  await supabaseAdmin.from('activity_log').insert({
    location_id: locationId,
    type: 'note',
    body,
    sent_by: 'portal',
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  let locationId: string
  try {
    ;({ locationId } = verifyCapabilitiesPortalToken(token))
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: loc, error: locErr } = await supabaseAdmin
    .from('locations')
    .select(
      `id, name, state, status, account_id,
      bar_license_number, hours_of_operation, standard_warranty,
      total_techs, allocated_techs, daily_appointment_capacity, weekly_appointment_capacity,
      capabilities_parking_spots_rw, capabilities_two_post_lifts,
      capabilities_afterhours_tow_ins, capabilities_night_drops,
      capabilities_tires, capabilities_wheel_alignment, capabilities_body_work,
      capabilities_adas, capabilities_ac_work, capabilities_forklift,
      capabilities_hv_battery_table, capabilities_windshields`,
    )
    .eq('id', locationId)
    .maybeSingle()

  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 })
  if (!loc) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  const L = loc as Record<string, unknown>

  const shopName = str(body.shop_name)
  const contactName = str(body.contact_name)
  const contactEmail = str(body.contact_email)
  const contactPhone = str(body.contact_phone)

  if (!shopName) return NextResponse.json({ error: 'Shop name is required' }, { status: 400 })
  if (!contactName) return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
  const emailErr = validatePortalEmail(contactEmail)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })

  const phoneDigits = stripPhoneToNationalDigits(contactPhone)
  const phoneErr = validateUsPhoneOptional(phoneDigits)
  if (phoneErr) return NextResponse.json({ error: phoneErr }, { status: 400 })
  const contactPhoneNorm = phoneDigits.length === 10 ? phoneDigits : ''

  const hoursRaw = str(body.hours_of_operation)
  if (!hoursRaw) return NextResponse.json({ error: 'hours_of_operation is required' }, { status: 400 })
  const hoursModel = tryParsePortalHoursJson(hoursRaw)
  if (!hoursModel) {
    return NextResponse.json(
      { error: 'Hours of operation must be completed using the day-by-day schedule' },
      { status: 400 },
    )
  }
  const hoursErr = validatePortalHoursModel(hoursModel)
  if (hoursErr) return NextResponse.json({ error: hoursErr }, { status: 400 })
  const hours = hoursRaw

  const total_techs = parseBoundedNonNegInt(String(body.total_techs ?? ''), PORTAL_INT_MAX.total_techs)
  const allocated_techs = parseBoundedNonNegInt(String(body.allocated_techs ?? ''), PORTAL_INT_MAX.allocated_techs)
  const daily_appointment_capacity = parseBoundedNonNegInt(
    String(body.daily_appointment_capacity ?? ''),
    PORTAL_INT_MAX.daily_appointment_capacity,
  )
  const weekly_appointment_capacity = parseBoundedNonNegInt(
    String(body.weekly_appointment_capacity ?? ''),
    PORTAL_INT_MAX.weekly_appointment_capacity,
  )
  const parking = parseBoundedNonNegInt(String(body.parking_spots_rw ?? ''), PORTAL_INT_MAX.parking_spots_rw)
  const lifts = parseBoundedNonNegInt(String(body.two_post_lifts ?? ''), PORTAL_INT_MAX.two_post_lifts)

  if (total_techs === null) return NextResponse.json({ error: 'Invalid full-time techs count' }, { status: 400 })
  if (allocated_techs === null) return NextResponse.json({ error: 'Invalid allocated techs count' }, { status: 400 })
  if (allocated_techs > total_techs) {
    return NextResponse.json({ error: "Allocated techs can't exceed total techs" }, { status: 400 })
  }
  if (daily_appointment_capacity === null)
    return NextResponse.json({ error: 'Invalid daily Fixlane appointment capacity' }, { status: 400 })
  if (weekly_appointment_capacity === null)
    return NextResponse.json({ error: 'Invalid weekly Fixlane appointment capacity' }, { status: 400 })
  if (parking === null) return NextResponse.json({ error: 'Invalid parking spots count' }, { status: 400 })
  if (lifts === null) return NextResponse.json({ error: 'Invalid 2-post lift count' }, { status: 400 })

  const tow = str(body.afterhours_tow_ins)
  const night = str(body.night_drops)
  if (!isYesNo(tow)) return NextResponse.json({ error: 'Invalid after-hours tow-ins answer' }, { status: 400 })
  if (!isYesNo(night)) return NextResponse.json({ error: 'Invalid night-drops answer' }, { status: 400 })

  const tires = str(body.tires)
  const alignment = str(body.wheel_alignment)
  const bodyWork = str(body.body_work)
  const adas = str(body.adas)
  const windshields = str(body.windshields)
  if (!isMember(tires, TIRES_VALUES)) return NextResponse.json({ error: 'Invalid tires answer' }, { status: 400 })
  if (!isMember(alignment, ALIGNMENT_VALUES))
    return NextResponse.json({ error: 'Invalid wheel alignment answer' }, { status: 400 })
  if (!isMember(bodyWork, THREE_TIER)) return NextResponse.json({ error: 'Invalid body work answer' }, { status: 400 })
  if (!isMember(adas, THREE_TIER)) return NextResponse.json({ error: 'Invalid ADAS answer' }, { status: 400 })
  if (!isMember(windshields, THREE_TIER))
    return NextResponse.json({ error: 'Invalid windshield answer' }, { status: 400 })

  const ac = str(body.ac_work)
  const forklift = str(body.forklift)
  const hvTable = str(body.hv_battery_table)
  if (!isMember(ac, AC_VALUES)) return NextResponse.json({ error: 'Invalid A/C answer' }, { status: 400 })
  if (!isMember(forklift, YES_NO)) return NextResponse.json({ error: 'Invalid forklift answer' }, { status: 400 })
  if (!isMember(hvTable, YES_NO))
    return NextResponse.json({ error: 'Invalid HV battery / scissor table answer' }, { status: 400 })

  let bar_license_number: string | null = null
  if (typeof body.bar_license_number === 'string') {
    const digits = body.bar_license_number.replace(/\D/g, '')
    bar_license_number = digits || null
  }
  if (isCA(L.state as string | null | undefined)) {
    if (!bar_license_number || bar_license_number.length < 6 || bar_license_number.length > 8) {
      return NextResponse.json(
        { error: 'BAR license number must be 6–8 digits for California shops' },
        { status: 400 },
      )
    }
  }

  const standard_warranty = str(body.standard_warranty)
  if (!standard_warranty) {
    return NextResponse.json({ error: 'Standard warranty for repairs is required' }, { status: 400 })
  }

  const accountId = (L.account_id as string | null | undefined) ?? null
  const primary = await resolvePrimaryContact(supabaseAdmin, accountId, locationId)

  const oldName = typeof L.name === 'string' ? L.name : ''
  const oldContactName = primary?.name ?? ''
  const oldEmail = primary?.email ?? ''
  const oldPhone = primary?.phone ?? ''

  const priorStatus = typeof L.status === 'string' ? L.status : ''

  const locationPatch: Record<string, unknown> = {
    name: shopName,
    bar_license_number,
    hours_of_operation: hours,
    standard_warranty: standard_warranty,
    total_techs,
    allocated_techs,
    daily_appointment_capacity,
    weekly_appointment_capacity,
    capabilities_parking_spots_rw: parking,
    capabilities_two_post_lifts: lifts,
    capabilities_afterhours_tow_ins: tow,
    capabilities_night_drops: night,
    capabilities_tires: tires,
    capabilities_wheel_alignment: alignment,
    capabilities_body_work: bodyWork,
    capabilities_adas: adas,
    capabilities_ac_work: ac,
    capabilities_forklift: forklift,
    capabilities_hv_battery_table: hvTable,
    capabilities_windshields: windshields,
    capabilities_submitted_at: new Date().toISOString(),
  }

  const { error: upErr } = await supabaseAdmin.from('locations').update(locationPatch).eq('id', locationId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  if (accountId) {
    if (primary?.id) {
      const { error: cErr } = await supabaseAdmin
        .from('contacts')
        .update({
          name: contactName || null,
          email: contactEmail || null,
          phone: contactPhoneNorm || null,
        })
        .eq('id', primary.id)
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    } else {
      await upsertLocationShopContact(supabaseAdmin, {
        locationId,
        accountId,
        name: contactName,
        email: contactEmail,
        phone: contactPhoneNorm,
      })
    }
  }

  if (fmtPortalLogValue(oldName) !== fmtPortalLogValue(shopName)) {
    await insertPortalNote(
      locationId,
      `Shop updated shop name from ${fmtPortalLogValue(oldName)} to ${fmtPortalLogValue(shopName)} via portal`,
    )
  }
  if (fmtPortalLogValue(oldContactName) !== fmtPortalLogValue(contactName)) {
    await insertPortalNote(
      locationId,
      `Shop updated contact name from ${fmtPortalLogValue(oldContactName)} to ${fmtPortalLogValue(contactName)} via portal`,
    )
  }
  if (fmtPortalLogValue(oldEmail) !== fmtPortalLogValue(contactEmail)) {
    await insertPortalNote(
      locationId,
      `Shop updated email from ${fmtPortalLogValue(oldEmail)} to ${fmtPortalLogValue(contactEmail)} via portal`,
    )
  }
  if (fmtPortalLogValue(oldPhone) !== fmtPortalLogValue(contactPhoneNorm)) {
    await insertPortalNote(
      locationId,
      `Shop updated phone from ${fmtPortalLogValue(oldPhone)} to ${fmtPortalLogValue(contactPhoneNorm)} via portal`,
    )
  }

  const capLines: string[] = []
  const pushIf = (label: string, oldV: unknown, newV: unknown) => {
    const o = fmtPortalLogValue(oldV)
    const n = fmtPortalLogValue(newV)
    if (o !== n) capLines.push(`${label}: ${o} → ${n}`)
  }
  pushIf('Standard warranty', L.standard_warranty, standard_warranty)
  pushIf('Hours of operation', L.hours_of_operation, hours)
  pushIf('BAR license', L.bar_license_number, bar_license_number)
  pushIf('Full-time techs', L.total_techs, total_techs)
  pushIf('Techs allocated to Fixlane', L.allocated_techs, allocated_techs)
  pushIf('Daily Fixlane appointments', L.daily_appointment_capacity, daily_appointment_capacity)
  pushIf('Weekly Fixlane appointments', L.weekly_appointment_capacity, weekly_appointment_capacity)
  pushIf('Fixlane parking spots', L.capabilities_parking_spots_rw, parking)
  pushIf('2-post lifts', L.capabilities_two_post_lifts, lifts)
  pushIf('After-hours tow-ins', L.capabilities_afterhours_tow_ins, tow)
  pushIf('Night drops', L.capabilities_night_drops, night)
  pushIf('Tires capability', L.capabilities_tires, tires)
  pushIf('Wheel alignment', L.capabilities_wheel_alignment, alignment)
  pushIf('Body work', L.capabilities_body_work, bodyWork)
  pushIf('ADAS calibrations', L.capabilities_adas, adas)
  pushIf('A/C work', L.capabilities_ac_work, ac)
  pushIf('Forklift', L.capabilities_forklift, forklift)
  pushIf('HV battery / scissor table', L.capabilities_hv_battery_table, hvTable)
  pushIf('Windshield replacement', L.capabilities_windshields, windshields)

  if (capLines.length > 0) {
    await insertPortalNote(
      locationId,
      `Shop updated capabilities via portal:\n${capLines.join('\n')}`,
    )
  }

  if (priorStatus === 'contacted') {
    const { error: stErr } = await supabaseAdmin.from('locations').update({ status: 'in_review' }).eq('id', locationId)
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })

    await supabaseAdmin.from('activity_log').insert({
      location_id: locationId,
      type: 'status_change',
      subject: 'Pipeline status',
      body: `${LOCATION_STATUS_LABELS.contacted} → ${LOCATION_STATUS_LABELS.in_review} (capabilities form submitted)`,
      sent_by: 'portal',
    })
  }

  return NextResponse.json({ ok: true })
}
