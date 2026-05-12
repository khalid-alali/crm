import type { SupabaseClient } from '@supabase/supabase-js'
import { geocodeAddress } from '@/lib/geocode'

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

type GoogleAddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

type LatLng = { lat: number; lng: number }

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/** Prefer Places formatted national number when it matches the submitted phone (same last 10 digits). */
export function pickPhoneForPromotion(submittedPhone: string, placesFormatted: string | null): string | null {
  if (!placesFormatted) return null
  const a = digitsOnly(submittedPhone)
  const b = digitsOnly(placesFormatted)
  if (b.length < 10) return null
  const a10 = a.length >= 10 ? a.slice(-10) : a
  const b10 = b.slice(-10)
  if (a10.length >= 10 && a10 === b10) return placesFormatted.trim()
  return null
}

/** True when Places has a full national number and it is not the same subscriber number as the form submission. */
export function placesPhoneDiffersFromSubmitted(submittedPhone: string, placesFormatted: string | null): boolean {
  if (!placesFormatted) return false
  const b = digitsOnly(placesFormatted)
  if (b.length < 10) return false
  const b10 = b.slice(-10)
  const a = digitsOnly(submittedPhone)
  if (a.length >= 10) return a.slice(-10) !== b10
  return true
}

function fieldEmpty(value: string | null | undefined): boolean {
  return !String(value ?? '').trim()
}

/** True when the location has no usable map pin yet (missing or non-finite lat/lng). */
export function locationCoordsMissing(lat: unknown, lng: unknown): boolean {
  const la = lat == null || lat === '' ? NaN : Number(lat)
  const ln = lng == null || lng === '' ? NaN : Number(lng)
  return !Number.isFinite(la) || !Number.isFinite(ln)
}

function pickComponent(
  components: GoogleAddressComponent[] | undefined,
  ...types: string[]
): GoogleAddressComponent | undefined {
  if (!components?.length) return undefined
  return components.find(c => types.some(t => c.types?.includes(t)))
}

export function parseAddressLineCityStatePostal(components: GoogleAddressComponent[] | undefined): {
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
} {
  if (!components?.length) {
    return { address_line1: null, city: null, state: null, postal_code: null }
  }
  const streetNumber = pickComponent(components, 'street_number')?.long_name ?? ''
  const route = pickComponent(components, 'route')?.long_name ?? ''
  const line1 = [streetNumber, route].filter(Boolean).join(' ').trim()
  const city =
    pickComponent(components, 'locality')?.long_name ??
    pickComponent(components, 'sublocality', 'sublocality_level_1')?.long_name ??
    pickComponent(components, 'neighborhood')?.long_name ??
    null
  const state = pickComponent(components, 'administrative_area_level_1')?.short_name?.toUpperCase() ?? null
  const postal = pickComponent(components, 'postal_code')?.long_name ?? null
  return {
    address_line1: line1 || null,
    city: city || null,
    state: state && /^[A-Z]{2}$/.test(state) ? state : null,
    postal_code: postal || null,
  }
}

function latLngFromGoogle(obj: { lat?: number; lng?: number } | undefined): LatLng | null {
  if (!obj) return null
  const lat = Number(obj.lat)
  const lng = Number(obj.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

type TextSearchResponse = {
  status: string
  error_message?: string
  results?: Array<{
    place_id?: string
    formatted_address?: string
    name?: string
    geometry?: { location?: { lat?: number; lng?: number } }
    rating?: number
    user_ratings_total?: number
    business_status?: string
  }>
}

type DetailsResponse = {
  status: string
  error_message?: string
  result?: {
    place_id?: string
    formatted_address?: string
    name?: string
    address_components?: GoogleAddressComponent[]
    formatted_phone_number?: string
    international_phone_number?: string
    website?: string
    rating?: number
    user_ratings_total?: number
    business_status?: string
    geometry?: { location?: { lat?: number; lng?: number } }
  }
}

async function googleTextSearch(query: string, apiKey: string): Promise<TextSearchResponse> {
  const url = new URL(TEXT_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString())
  if (!res.ok) {
    return { status: 'HTTP_ERROR', error_message: `HTTP ${res.status}` }
  }
  return (await res.json()) as TextSearchResponse
}

async function googlePlaceDetails(placeId: string, apiKey: string): Promise<DetailsResponse> {
  const url = new URL(PLACE_DETAILS_URL)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set(
    'fields',
    [
      'place_id',
      'name',
      'formatted_address',
      'address_components',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'geometry',
      'rating',
      'user_ratings_total',
      'business_status',
    ].join(','),
  )
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString())
  if (!res.ok) {
    return { status: 'HTTP_ERROR', error_message: `HTTP ${res.status}` }
  }
  return (await res.json()) as DetailsResponse
}

async function upsertEnrichmentRow(
  supabase: SupabaseClient,
  row: {
    location_id: string
    enrichment_status: 'enriched' | 'needs_review' | 'failed'
    place_id?: string | null
    formatted_address?: string | null
    google_rating?: number | null
    google_review_count?: number | null
    business_status?: string | null
    website?: string | null
    phone_places?: string | null
    geometry_lat?: number | null
    geometry_lng?: number | null
    raw_payload: Record<string, unknown>
  },
) {
  await supabase.from('location_enrichment').upsert(
    {
      location_id: row.location_id,
      enrichment_source: 'google_places',
      enrichment_status: row.enrichment_status,
      place_id: row.place_id ?? null,
      formatted_address: row.formatted_address ?? null,
      google_rating: row.google_rating ?? null,
      google_review_count: row.google_review_count ?? null,
      business_status: row.business_status ?? null,
      website: row.website ?? null,
      phone_places: row.phone_places ?? null,
      geometry_lat: row.geometry_lat ?? null,
      geometry_lng: row.geometry_lng ?? null,
      raw_payload: row.raw_payload,
    },
    { onConflict: 'location_id' },
  )
}

export type LeadEnrichmentInput = {
  locationId: string
  shopName: string
  postalCode: string | null
  submittedPhone: string
}

export type LeadEnrichmentResult = {
  /** Use for primary contact row when Places returned a nicer-format same-number phone. */
  contactPhone: string
}

type EnrichmentFailurePartial = Partial<{
  place_id: string | null
  formatted_address: string | null
  google_rating: number | null
  google_review_count: number | null
  business_status: string | null
  website: string | null
  phone_places: string | null
  geometry_lat: number | null
  geometry_lng: number | null
}>

export type LeadEnrichmentComputeFailure = {
  ok: false
  status: 'needs_review' | 'failed'
  rawPayload: Record<string, unknown>
  partial?: EnrichmentFailurePartial
}

export type LocationEnrichmentSnapshot = {
  name: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  county: string | null
  website: string | null
  phone: string | null
  lat: unknown
  lng: unknown
  enrichment_status: string | null
  account_id: string | null
}

export type LeadEnrichmentComputeSuccess = {
  ok: true
  locationId: string
  rawPayload: Record<string, unknown>
  before: LocationEnrichmentSnapshot
  locationPatch: Record<string, unknown>
  enrichmentUpsert: {
    location_id: string
    enrichment_status: 'enriched'
    place_id: string | null
    formatted_address: string | null
    google_rating: number | null
    google_review_count: number | null
    business_status: string | null
    website: string | null
    phone_places: string | null
    geometry_lat: number | null
    geometry_lng: number | null
    raw_payload: Record<string, unknown>
  }
  contactPhone: string
  submittedPhone: string
  promotedPhone: string | null
  placesPhone: string | null
  wouldCreateStoreContact: boolean
  storeContactPhone: string | null
  /** Business / place title from Google (Place Details, then Text Search). */
  googlePlaceName: string | null
  googleFormattedAddress: string | null
  coords: LatLng | null
  /** Partial row if location update fails after compute */
  persistFailurePartial: EnrichmentFailurePartial
}

export type LeadEnrichmentComputeResult = LeadEnrichmentComputeFailure | LeadEnrichmentComputeSuccess

async function persistLeadEnrichmentFailure(
  supabase: SupabaseClient,
  locationId: string,
  submittedPhone: string,
  failure: LeadEnrichmentComputeFailure,
): Promise<LeadEnrichmentResult> {
  await supabase.from('locations').update({ enrichment_status: failure.status }).eq('id', locationId)
  await upsertEnrichmentRow(supabase, {
    location_id: locationId,
    enrichment_status: failure.status,
    raw_payload: failure.rawPayload,
    ...failure.partial,
  })
  return { contactPhone: submittedPhone }
}

/**
 * Google Places + geocode pipeline without writing to `locations` or `location_enrichment`.
 * Used for preview UI and as the first phase of {@link enrichLeadLocation}.
 */
export async function computeLeadEnrichment(
  supabase: SupabaseClient,
  input: LeadEnrichmentInput,
): Promise<LeadEnrichmentComputeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { locationId, shopName, postalCode, submittedPhone } = input

  const rawPayload: Record<string, unknown> = {
    query: [shopName, postalCode].filter(Boolean).join(' ').trim(),
  }

  const err = (
    status: 'needs_review' | 'failed',
    payload: Record<string, unknown>,
    partial?: EnrichmentFailurePartial,
  ): LeadEnrichmentComputeFailure => ({
    ok: false,
    status,
    rawPayload: payload,
    ...(partial !== undefined ? { partial } : {}),
  })

  if (!apiKey) {
    rawPayload.error = 'GOOGLE_MAPS_API_KEY is not configured'
    return err('failed', rawPayload)
  }

  const query = [shopName, postalCode].filter(Boolean).join(' ').trim() || shopName
  let textJson: TextSearchResponse
  try {
    textJson = await googleTextSearch(query, apiKey)
  } catch (e) {
    rawPayload.text_search_error = String(e)
    return err('failed', rawPayload)
  }

  rawPayload.text_search = textJson

  if (textJson.status !== 'OK' && textJson.status !== 'ZERO_RESULTS') {
    rawPayload.text_search_status = textJson.status
    rawPayload.text_search_error_message = textJson.error_message
    return err('failed', rawPayload)
  }
  if (!textJson.results?.length) {
    return err('needs_review', rawPayload)
  }

  const first = textJson.results[0]
  const placeId = first.place_id
  if (!placeId) {
    return err('needs_review', rawPayload)
  }

  let detailsJson: DetailsResponse
  try {
    detailsJson = await googlePlaceDetails(placeId, apiKey)
  } catch (e) {
    rawPayload.place_details_error = String(e)
    return err('failed', rawPayload, { place_id: placeId })
  }

  rawPayload.place_details = detailsJson

  if (detailsJson.status !== 'OK') {
    rawPayload.place_details_status = detailsJson.status
    rawPayload.place_details_error_message = detailsJson.error_message
    return err('failed', rawPayload, {
      place_id: placeId,
      formatted_address: first.formatted_address ?? null,
      google_rating: first.rating ?? null,
      google_review_count: first.user_ratings_total ?? null,
      business_status: first.business_status ?? null,
      geometry_lat: latLngFromGoogle(first.geometry?.location)?.lat ?? null,
      geometry_lng: latLngFromGoogle(first.geometry?.location)?.lng ?? null,
    })
  }
  if (!detailsJson.result) {
    return err('needs_review', rawPayload, {
      place_id: placeId,
      formatted_address: first.formatted_address ?? null,
      google_rating: first.rating ?? null,
      google_review_count: first.user_ratings_total ?? null,
      business_status: first.business_status ?? null,
      geometry_lat: latLngFromGoogle(first.geometry?.location)?.lat ?? null,
      geometry_lng: latLngFromGoogle(first.geometry?.location)?.lng ?? null,
    })
  }

  const r = detailsJson.result
  const parsed = parseAddressLineCityStatePostal(r.address_components)
  const placesGeo =
    latLngFromGoogle(r.geometry?.location) ?? latLngFromGoogle(first.geometry?.location)

  let county: string | null = null
  let stateForRow = parsed.state
  let geocodedAt: string | null = null
  let coords: LatLng | null = placesGeo

  const gc = await geocodeAddress({
    address_line1: parsed.address_line1 ?? undefined,
    city: parsed.city ?? undefined,
    state: parsed.state ?? undefined,
    postal_code: parsed.postal_code ?? postalCode ?? undefined,
  })
  if (gc) {
    county = gc.county
    if (!stateForRow && gc.state) stateForRow = gc.state
    geocodedAt = new Date().toISOString()
    coords = { lat: gc.lat, lng: gc.lng }
  }

  const { data: existingLoc } = await supabase
    .from('locations')
    .select('name, address_line1, city, state, postal_code, county, website, phone, account_id, lat, lng, enrichment_status')
    .eq('id', locationId)
    .maybeSingle()

  const before: LocationEnrichmentSnapshot = {
    name: existingLoc?.name ?? null,
    address_line1: existingLoc?.address_line1 ?? null,
    city: existingLoc?.city ?? null,
    state: existingLoc?.state ?? null,
    postal_code: existingLoc?.postal_code ?? null,
    county: existingLoc?.county ?? null,
    website: existingLoc?.website ?? null,
    phone: existingLoc?.phone ?? null,
    lat: existingLoc?.lat,
    lng: existingLoc?.lng,
    enrichment_status: existingLoc?.enrichment_status ?? null,
    account_id: existingLoc?.account_id ?? null,
  }

  const placesPhone = r.formatted_phone_number ?? r.international_phone_number ?? null
  const promotedPhone = pickPhoneForPromotion(submittedPhone, placesPhone)
  const contactPhone = promotedPhone ?? submittedPhone

  const locationPatch: Record<string, unknown> = {
    enrichment_status: 'enriched',
    address_line1: parsed.address_line1,
    state: stateForRow,
    postal_code: parsed.postal_code ?? postalCode,
    phone: promotedPhone ?? null,
  }
  const coordsMissing = locationCoordsMissing(existingLoc?.lat, existingLoc?.lng)
  if (coordsMissing && coords) {
    locationPatch.lat = coords.lat
    locationPatch.lng = coords.lng
    locationPatch.geocoded_at = geocodedAt ?? new Date().toISOString()
    if (county != null) locationPatch.county = county
  }
  if (fieldEmpty(existingLoc?.city) && parsed.city) {
    locationPatch.city = parsed.city
  }
  if (fieldEmpty(existingLoc?.website) && r.website) {
    locationPatch.website = r.website
  }

  const cityForDisplay = (
    fieldEmpty(existingLoc?.city) ? String(parsed.city ?? '') : String(existingLoc?.city ?? '')
  ).trim()
  if (/^midas$/i.test(shopName.trim()) && cityForDisplay) {
    locationPatch.name = `Midas ${cityForDisplay}`
  }

  let wouldCreateStoreContact = false
  let storeContactPhone: string | null = null
  if (placesPhone && placesPhoneDiffersFromSubmitted(submittedPhone, placesPhone)) {
    const b10 = digitsOnly(placesPhone).slice(-10)
    const { data: siblingContacts } = await supabase
      .from('contacts')
      .select('id, phone')
      .eq('location_id', locationId)
    const alreadyHaveNumber = siblingContacts?.some(
      row => digitsOnly(row.phone ?? '').slice(-10) === b10 && digitsOnly(row.phone ?? '').length >= 10,
    )
    if (!alreadyHaveNumber) {
      wouldCreateStoreContact = true
      storeContactPhone = (r.formatted_phone_number ?? r.international_phone_number ?? placesPhone).trim()
    }
  }

  const persistFailurePartial: EnrichmentFailurePartial = {
    place_id: r.place_id ?? placeId,
    formatted_address: r.formatted_address ?? first.formatted_address ?? null,
    google_rating: r.rating ?? first.rating ?? null,
    google_review_count: r.user_ratings_total ?? first.user_ratings_total ?? null,
    business_status: r.business_status ?? first.business_status ?? null,
    website: r.website ?? null,
    phone_places: placesPhone,
    geometry_lat: coords?.lat ?? null,
    geometry_lng: coords?.lng ?? null,
  }

  const googlePlaceName = (r.name ?? first.name ?? '').trim() || null

  return {
    ok: true,
    locationId,
    rawPayload,
    before,
    locationPatch,
    enrichmentUpsert: {
      location_id: locationId,
      enrichment_status: 'enriched',
      place_id: r.place_id ?? placeId,
      formatted_address: r.formatted_address ?? first.formatted_address ?? null,
      google_rating: r.rating ?? first.rating ?? null,
      google_review_count: r.user_ratings_total ?? first.user_ratings_total ?? null,
      business_status: r.business_status ?? first.business_status ?? null,
      website: r.website ?? null,
      phone_places: placesPhone,
      geometry_lat: coords?.lat ?? null,
      geometry_lng: coords?.lng ?? null,
      raw_payload: rawPayload,
    },
    contactPhone,
    submittedPhone,
    promotedPhone,
    placesPhone,
    wouldCreateStoreContact,
    storeContactPhone,
    googlePlaceName,
    googleFormattedAddress: r.formatted_address ?? first.formatted_address ?? null,
    coords,
    persistFailurePartial,
  }
}

export type LeadEnrichmentPreviewChange = {
  label: string
  before: string
  after: string
}

export type LeadEnrichmentPreviewResult =
  | { ok: false; status: 'needs_review' | 'failed'; message: string }
  | {
      ok: true
      message: string
      googlePlaceName: string | null
      googleFormattedAddress: string | null
      changes: LeadEnrichmentPreviewChange[]
      notes: string[]
    }

function displayCell(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v).trim() || '—'
}

function formatCoordPair(lat: unknown, lng: unknown): string {
  const la = lat == null || lat === '' ? NaN : Number(lat)
  const ln = lng == null || lng === '' ? NaN : Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '—'
  return `${la.toFixed(5)}, ${ln.toFixed(5)}`
}

/** Build human-readable rows for the confirm modal (only fields that would change). */
export function buildLeadEnrichmentPreviewChanges(computed: LeadEnrichmentComputeSuccess): LeadEnrichmentPreviewChange[] {
  const { before, locationPatch } = computed
  const changes: LeadEnrichmentPreviewChange[] = []
  const b = before

  const skipScalar = new Set(['lat', 'lng', 'geocoded_at', 'enrichment_status'])

  if ('lat' in locationPatch && 'lng' in locationPatch) {
    const afterLat = locationPatch.lat
    const afterLng = locationPatch.lng
    const beforeS = formatCoordPair(b.lat, b.lng)
    const afterS = formatCoordPair(afterLat, afterLng)
    if (beforeS !== afterS) {
      changes.push({ label: 'Map coordinates', before: beforeS, after: afterS })
    }
  }

  for (const [key, afterVal] of Object.entries(locationPatch)) {
    if (skipScalar.has(key)) continue
    const labelByKey: Record<string, string> = {
      name: 'Shop name',
      address_line1: 'Street address',
      city: 'City',
      state: 'State',
      postal_code: 'Postal code',
      county: 'County',
      website: 'Website',
      phone: 'Shop phone (location row)',
    }
    const label = labelByKey[key] ?? key
    const beforeVal = (b as Record<string, unknown>)[key]
    const beforeS = displayCell(beforeVal)
    const afterS = displayCell(afterVal)
    if (beforeS === afterS) continue
    changes.push({ label, before: beforeS, after: afterS })
  }

  const primaryBefore = displayCell(computed.submittedPhone)
  const primaryAfter = displayCell(computed.contactPhone)
  if (primaryBefore !== primaryAfter) {
    changes.push({ label: 'Primary contact phone', before: primaryBefore, after: primaryAfter })
  }

  return changes
}

export async function previewLeadEnrichment(
  supabase: SupabaseClient,
  input: LeadEnrichmentInput,
): Promise<LeadEnrichmentPreviewResult> {
  const computed = await computeLeadEnrichment(supabase, input)
  if (!computed.ok) {
    if (computed.status === 'needs_review') {
      return {
        ok: false,
        status: 'needs_review',
        message: 'No confident Google Places match for this shop. Nothing will be overwritten.',
      }
    }
    const p = computed.rawPayload
    let message = 'Enrichment failed (see location_enrichment in Supabase for details).'
    if (typeof p.error === 'string') message = p.error
    else if (typeof p.text_search_error === 'string') message = p.text_search_error
    else if (typeof p.place_details_error === 'string') message = p.place_details_error
    else if (typeof p.text_search_error_message === 'string' && typeof p.text_search_status === 'string') {
      message = `Google Text Search (${p.text_search_status}): ${p.text_search_error_message}`
    } else if (typeof p.place_details_error_message === 'string') {
      message = `Google Place Details: ${p.place_details_error_message}`
    }
    return { ok: false, status: 'failed', message }
  }

  const changes = buildLeadEnrichmentPreviewChanges(computed)
  const notes: string[] = []
  if (computed.wouldCreateStoreContact && computed.storeContactPhone) {
    notes.push(
      'A new location contact “Store contact” will be added because the Google business phone differs from the primary contact.',
    )
  }

  return {
    ok: true,
    message: 'Review updates from Google Places. Confirm to save them to this location.',
    googlePlaceName: computed.googlePlaceName,
    googleFormattedAddress: computed.googleFormattedAddress,
    changes,
    notes,
  }
}

/**
 * Text Search → Place Details → update `locations`, upsert `location_enrichment`.
 * Uses GOOGLE_MAPS_API_KEY (same as Geocoding). Never throws.
 */
export async function enrichLeadLocation(
  supabase: SupabaseClient,
  input: LeadEnrichmentInput,
): Promise<LeadEnrichmentResult> {
  const { locationId, submittedPhone } = input

  const computed = await computeLeadEnrichment(supabase, input)
  if (!computed.ok) {
    return persistLeadEnrichmentFailure(supabase, locationId, submittedPhone, computed)
  }

  const { rawPayload, locationPatch, enrichmentUpsert, persistFailurePartial } = computed

  const { error: upErr } = await supabase.from('locations').update(locationPatch).eq('id', locationId)
  if (upErr) {
    rawPayload.location_update_error = upErr.message
    await persistLeadEnrichmentFailure(supabase, locationId, submittedPhone, {
      ok: false,
      status: 'failed',
      rawPayload,
      partial: persistFailurePartial,
    })
    return { contactPhone: submittedPhone }
  }

  await upsertEnrichmentRow(supabase, enrichmentUpsert)

  if (computed.wouldCreateStoreContact && computed.storeContactPhone) {
    const { error: storeContactErr } = await supabase.from('contacts').insert({
      account_id: computed.before.account_id ?? null,
      location_id: locationId,
      name: 'Store contact',
      phone: computed.storeContactPhone,
      role: 'service_advisor',
      is_primary: false,
      notes: 'Auto-created from Google Places (store phone differs from form submission).',
    })
    if (storeContactErr) {
      rawPayload.store_contact_insert_error = storeContactErr.message
      await supabase
        .from('location_enrichment')
        .update({ raw_payload: rawPayload })
        .eq('location_id', locationId)
    }
  }

  return { contactPhone: computed.contactPhone }
}
