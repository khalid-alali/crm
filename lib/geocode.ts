export async function geocodeAddress(parts: {
  address_line1?: string
  city?: string
  state?: string
  postal_code?: string
}): Promise<{ lat: number; lng: number } | null> {
  const address = [parts.address_line1, parts.city, parts.state, parts.postal_code]
    .filter(Boolean)
    .join(', ')
  if (!address || address.length < 5) return null
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
  )
  const data = await res.json()
  if (data.status !== 'OK') return null
  const loc = data.results[0]?.geometry?.location
  if (!loc) return null
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}
