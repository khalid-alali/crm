export function stateFieldIsEmpty(raw: string | null | undefined) {
  return !String(raw ?? '').trim()
}

type GeocodeAddressComponent = {
  long_name?: string
  short_name?: string
  types?: string[]
}

function countyFromAddressComponents(components: GeocodeAddressComponent[] | undefined): string | null {
  if (!components?.length) return null
  const c = components.find(x => x.types?.includes('administrative_area_level_2'))
  const name = c?.long_name?.trim()
  return name || null
}

/** Two-letter state code when Google marks the result as US (`administrative_area_level_1`). */
function usStateShortFromAddressComponents(components: GeocodeAddressComponent[] | undefined): string | null {
  if (!components?.length) return null
  const isUS = components.some(
    x => x.types?.includes('country') && x.short_name?.trim().toUpperCase() === 'US',
  )
  if (!isUS) return null
  const c = components.find(x => x.types?.includes('administrative_area_level_1'))
  const code = c?.short_name?.trim().toUpperCase()
  if (code && /^[A-Z]{2}$/.test(code)) return code
  return null
}

export type GeocodeResult = {
  lat: number
  lng: number
  /** US county when present in Google response (`administrative_area_level_2`). */
  county: string | null
  /** US state abbreviation when country is US (`administrative_area_level_1` short_name). */
  state: string | null
}

export async function geocodeAddress(parts: {
  address_line1?: string
  city?: string
  state?: string
  postal_code?: string
}): Promise<GeocodeResult | null> {
  const address = [parts.address_line1, parts.city, parts.state, parts.postal_code]
    .filter(Boolean)
    .join(', ')
  if (!address || address.length < 5) return null
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`,
  )
  const data = await res.json()
  if (data.status !== 'OK') return null
  const first = data.results?.[0]
  const loc = first?.geometry?.location
  if (!loc) return null
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const comps = first.address_components as GeocodeAddressComponent[] | undefined
  const county = countyFromAddressComponents(comps)
  const state = usStateShortFromAddressComponents(comps)
  return { lat, lng, county, state }
}
