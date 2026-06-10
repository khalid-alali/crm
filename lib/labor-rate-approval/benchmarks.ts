import type { SupabaseClient } from '@supabase/supabase-js'
import { activeLocations } from '@/lib/locations-active'

const EARTH_RADIUS_MILES = 3958.8
export const BENCHMARK_MAX_DISTANCE_MILES = 100
export const BENCHMARK_MAX_SHOPS = 10

type ShopCandidate = {
  id: string
  name: string
  lat: number
  lng: number
  standard_labor_rate: number
}

export type LaborRateBenchmarkShop = {
  id: string
  name: string
  distanceMiles: number
  standardLaborRate: number
}

export type LaborRateBenchmarkResult = {
  averageRate: number | null
  shopsSurveyed: number
  shops: LaborRateBenchmarkShop[]
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in miles. */
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a))
}

function latDeltaForMiles(miles: number): number {
  return miles / 69
}

function lngDeltaForMiles(miles: number, lat: number): number {
  const cosLat = Math.cos(toRad(lat))
  return cosLat > 0.01 ? miles / (69 * cosLat) : miles / 69
}

export function averageLaborRate(shops: { standardLaborRate: number }[]): number | null {
  if (shops.length === 0) return null
  const sum = shops.reduce((acc, s) => acc + s.standardLaborRate, 0)
  return sum / shops.length
}

export async function pullLaborRateBenchmarks(
  supabase: SupabaseClient,
  locationId: string,
): Promise<LaborRateBenchmarkResult> {
  const { data: target, error: targetError } = await supabase
    .from('locations')
    .select('id, lat, lng')
    .eq('id', locationId)
    .maybeSingle()
  if (targetError) throw new Error(targetError.message)
  if (!target) throw new Error('Location not found')

  const lat = Number(target.lat)
  const lng = Number(target.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Target shop must be geocoded before pulling benchmarks')
  }

  const latDelta = latDeltaForMiles(BENCHMARK_MAX_DISTANCE_MILES)
  const lngDelta = lngDeltaForMiles(BENCHMARK_MAX_DISTANCE_MILES, lat)

  const { data: rows, error: queryError } = await activeLocations(
    supabase,
    'id, name, lat, lng, standard_labor_rate',
  )
    .neq('id', locationId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .not('standard_labor_rate', 'is', null)
    .gt('standard_labor_rate', 0)
    .gte('lat', lat - latDelta)
    .lte('lat', lat + latDelta)
    .gte('lng', lng - lngDelta)
    .lte('lng', lng + lngDelta)

  if (queryError) throw new Error(queryError.message)

  const nearby: LaborRateBenchmarkShop[] = []
  for (const row of rows ?? []) {
    const shopLat = Number(row.lat)
    const shopLng = Number(row.lng)
    const rate = Number(row.standard_labor_rate)
    if (!Number.isFinite(shopLat) || !Number.isFinite(shopLng) || !Number.isFinite(rate) || rate <= 0) {
      continue
    }
    const distanceMiles = haversineMiles(lat, lng, shopLat, shopLng)
    if (distanceMiles > BENCHMARK_MAX_DISTANCE_MILES) continue
    nearby.push({
      id: row.id,
      name: row.name,
      distanceMiles,
      standardLaborRate: rate,
    })
  }

  nearby.sort((a, b) => a.distanceMiles - b.distanceMiles)
  const shops = nearby.slice(0, BENCHMARK_MAX_SHOPS)

  return {
    averageRate: averageLaborRate(shops),
    shopsSurveyed: shops.length,
    shops,
  }
}
