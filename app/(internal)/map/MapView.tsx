'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'
import { US_STATE_CODES_SET, US_STATE_OPTIONS } from '@/lib/us-states'
import { US_CONTINENTAL_BOUNDS, US_STATE_BOUNDS } from '@/lib/us-state-map-bounds'

const STATUS_COLORS: Record<string, string> = {
  lead: '#6D6E70',
  contacted: '#687CF9',
  in_review: '#8595F9',
  contracted: '#69C77A',
  active: '#1D9E75',
  inactive: '#E24B4A',
}

const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']
/** Statuses shown in the map filter (churned is toggled separately). */
const MAP_FILTER_STATUSES = STATUSES.filter(s => s !== 'inactive')

interface Location {
  id: string
  name: string
  chain_name: string | null
  city: string | null
  state: string | null
  status: string
  lat: number | string | null
  lng: number | string | null
  address_line1: string | null
  primary_owner_name: string | null
  primary_owner_email: string | null
}

function toLngLat(loc: Location): [number, number] | null {
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lng, lat]
}

function normalizeStateCode(raw: string | null): string | null {
  if (!raw) return null
  const t = raw.trim().toUpperCase()
  return US_STATE_CODES_SET.has(t) ? t : null
}

function getVisibleLocations(locs: Location[], filterStatus: string, showChurned: boolean): Location[] {
  if (filterStatus) {
    return locs.filter(l => l.status === filterStatus)
  }
  if (!showChurned) {
    return locs.filter(l => l.status !== 'inactive')
  }
  return locs
}

function featureCollection(
  locs: Location[],
  filterStatus: string,
  showChurned: boolean,
): GeoJSON.FeatureCollection {
  const list = getVisibleLocations(locs, filterStatus, showChurned)
  const features: GeoJSON.Feature[] = list.flatMap(loc => {
    const ll = toLngLat(loc)
    if (!ll) return []
    return [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: ll },
        properties: { id: loc.id, status: loc.status },
      },
    ]
  })
  return { type: 'FeatureCollection', features }
}

export default function MapView({ locations }: { locations: Location[] }) {
  const router = useRouter()
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const locationsRef = useRef(locations)
  locationsRef.current = locations
  const filterStatusRef = useRef('')
  const showChurnedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Location | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  filterStatusRef.current = filterStatus
  const [showChurned, setShowChurned] = useState(false)
  showChurnedRef.current = showChurned
  const [mapJump, setMapJump] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null)

  const scoped = useMemo(
    () => getVisibleLocations(locations, filterStatus, showChurned),
    [locations, filterStatus, showChurned],
  )
  const pinsShown = scoped.filter(l => toLngLat(l) != null).length
  const missingCoords = scoped.length - pinsShown
  const geocodeCandidates = scoped.filter(l => toLngLat(l) == null && l.address_line1?.trim()).length
  const nonChurnedCount = useMemo(
    () => locations.filter(l => l.status !== 'inactive').length,
    [locations],
  )
  const churnedCount = useMemo(() => locations.filter(l => l.status === 'inactive').length, [locations])
  const allRowCount = showChurned ? locations.length : nonChurnedCount

  const stateCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const loc of scoped) {
      const code = normalizeStateCode(loc.state)
      if (!code) continue
      m.set(code, (m.get(code) ?? 0) + 1)
    }
    return m
  }, [scoped])

  const statePickerOptions = useMemo(() => {
    return US_STATE_OPTIONS.filter(({ code }) => (stateCounts.get(code) ?? 0) > 0)
  }, [stateCounts])

  useEffect(() => {
    if (!mapJump) return
    if (!statePickerOptions.some(o => o.code === mapJump)) setMapJump('')
  }, [mapJump, statePickerOptions])

  useEffect(() => {
    if (selected && !scoped.some(l => l.id === selected.id)) setSelected(null)
  }, [selected, scoped])

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-118.2437, 34.0522],
      zoom: 9,
    })
    mapRef.current = map

    map.on('load', () => {
      const data = featureCollection(
        locationsRef.current,
        filterStatusRef.current,
        showChurnedRef.current,
      )
      map.addSource('locations', {
        type: 'geojson',
        data,
      })

      map.addLayer({
        id: 'locations',
        type: 'circle',
        source: 'locations',
        paint: {
          'circle-color': [
            'match',
            ['get', 'status'],
            'lead',
            STATUS_COLORS.lead,
            'contacted',
            STATUS_COLORS.contacted,
            'in_review',
            STATUS_COLORS.in_review,
            'contracted',
            STATUS_COLORS.contracted,
            'active',
            STATUS_COLORS.active,
            'inactive',
            STATUS_COLORS.inactive,
            '#888780',
          ],
          'circle-radius': 8,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      map.on('click', 'locations', e => {
        const id = e.features?.[0]?.properties?.id
        const loc = locationsRef.current.find(l => l.id === id)
        if (loc) setSelected(loc)
      })

      map.on('mouseenter', 'locations', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'locations', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    const source = map.getSource('locations') as mapboxgl.GeoJSONSource | undefined
    if (!source) return
    source.setData(featureCollection(locations, filterStatus, showChurned))
  }, [locations, filterStatus, showChurned])

  function flyMapToArea(code: string) {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!code) {
        map.fitBounds(US_CONTINENTAL_BOUNDS, { padding: 28, duration: 1100, maxZoom: 4.5 })
        return
      }
      const b = US_STATE_BOUNDS[code]
      if (!b) return
      const maxZoom = code === 'AK' || code === 'HI' ? 5.5 : 8
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: 44, duration: 1100, maxZoom },
      )
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }

  async function handleGeocodeAll() {
    setGeocoding(true)
    setGeocodeResult(null)
    try {
      const res = await fetch('/api/geocode', { method: 'POST' })
      const data = await res.json()
      setGeocodeResult(`Geocoded ${data.geocoded} of ${data.total} addresses`)
      router.refresh()
    } catch {
      setGeocodeResult('Error geocoding')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="flex-1 flex relative">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-arctic-200 p-3 flex flex-col gap-3 z-10">
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Filter by status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full border border-arctic-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All ({allRowCount})</option>
            {MAP_FILTER_STATUSES.map(s => {
              const cnt = locations.filter(l => l.status === s).length
              return (
                <option key={s} value={s}>
                  {LOCATION_STATUS_LABELS[s]} ({cnt})
                </option>
              )
            })}
          </select>
          <label
            className={`mt-2 flex items-center gap-2 text-xs ${
              filterStatus ? 'text-onix-400 cursor-not-allowed' : 'text-onix-700 cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              className="rounded border-arctic-300"
              checked={showChurned}
              disabled={Boolean(filterStatus)}
              onChange={e => setShowChurned(e.target.checked)}
            />
            <span>Show churned ({churnedCount})</span>
          </label>
          {filterStatus ? (
            <p className="text-[11px] text-onix-500 mt-1">Churned toggle applies in &quot;All&quot; view only.</p>
          ) : null}
          <p className="text-xs text-onix-600 mt-1.5 leading-snug">
            {filterStatus
              ? `${pinsShown} on map for this status (${scoped.length} in status)`
              : `${pinsShown} on map of ${allRowCount} shops`}
            {missingCoords > 0 ? ` · ${missingCoords} lack coordinates` : null}
            {geocodeCandidates > 0 ? ` · ${geocodeCandidates} with address to geocode` : null}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Jump to state</label>
          <select
            value={mapJump}
            onChange={e => {
              const code = e.target.value
              setMapJump(code)
              flyMapToArea(code)
            }}
            className="w-full border border-arctic-300 rounded px-2 py-1 text-sm"
          >
            <option value="">— Select state —</option>
            {statePickerOptions.map(({ code, name }) => (
              <option key={code} value={code}>
                {name} ({stateCounts.get(code)})
              </option>
            ))}
          </select>
          {statePickerOptions.length === 0 ? (
            <p className="text-[11px] text-onix-500 mt-1">No shops with a US state in this view.</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          {MAP_FILTER_STATUSES.map(s => (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
              <span className="text-onix-600">{LOCATION_STATUS_LABELS[s]}</span>
            </div>
          ))}
          {showChurned && !filterStatus ? (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS.inactive }}
              />
              <span className="text-onix-600">{LOCATION_STATUS_LABELS.inactive}</span>
            </div>
          ) : null}
        </div>
        {locations.length === 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            No shops yet. Add locations on the Shops page.
          </p>
        )}

        <div className="mt-auto">
          <button
            onClick={handleGeocodeAll}
            disabled={geocoding}
            className="w-full px-2 py-1.5 text-xs bg-onix-800 text-white rounded hover:bg-onix-950 disabled:opacity-50"
          >
            {geocoding ? 'Geocoding…' : 'Geocode missing addresses'}
          </button>
          {geocodeResult && <p className="text-xs text-onix-600 mt-1">{geocodeResult}</p>}
        </div>
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1" />

      {/* Popup */}
      {selected && (
        <div className="absolute bottom-6 left-64 bg-white border border-arctic-200 rounded-lg shadow-lg p-4 w-64 z-20">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute top-2 right-2 text-onix-400 hover:text-onix-600"
          >
            &times;
          </button>
          <div className="flex items-center gap-1 mb-1">
            <span className="font-medium text-sm">{selected.name}</span>
            <ChainBadge chain={selected.chain_name} />
          </div>
          <div className="text-xs text-onix-600 mb-2">{[selected.city, selected.state].filter(Boolean).join(', ')}</div>
          <StatusBadge status={selected.status} />
          <div className="mt-3">
            <a href={`/shops/${selected.id}`} className="text-xs text-brand-600 hover:underline">
              View shop →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
