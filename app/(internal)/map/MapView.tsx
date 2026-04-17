'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import StatusBadge from '@/components/StatusBadge'
import ChainBadge from '@/components/ChainBadge'
import { LOCATION_STATUS_LABELS } from '@/lib/location-status-labels'

const STATUS_COLORS: Record<string, string> = {
  lead: '#6D6E70',
  contacted: '#687CF9',
  in_review: '#8595F9',
  contracted: '#69C77A',
  active: '#1D9E75',
  inactive: '#E24B4A',
}

const STATUSES = ['lead', 'contacted', 'in_review', 'contracted', 'active', 'inactive']

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

function featureCollection(locs: Location[], filterStatus: string): GeoJSON.FeatureCollection {
  const list = filterStatus ? locs.filter(l => l.status === filterStatus) : locs
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Location | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  filterStatusRef.current = filterStatus
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null)

  const scoped = filterStatus ? locations.filter(l => l.status === filterStatus) : locations
  const pinsShown = scoped.filter(l => toLngLat(l) != null).length
  const pinsOnMapAll = locations.filter(l => toLngLat(l) != null).length
  const missingCoords = locations.length - pinsOnMapAll
  const geocodeCandidates = locations.filter(l => toLngLat(l) == null && l.address_line1?.trim()).length

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
      const data = featureCollection(locationsRef.current, filterStatusRef.current)
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
    source.setData(featureCollection(locations, filterStatus))
  }, [locations, filterStatus])

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
      <div className="w-52 bg-white border-r border-arctic-200 p-3 flex flex-col gap-3 z-10">
        <div>
          <label className="block text-xs font-medium text-onix-600 mb-1">Filter by status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full border border-arctic-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All ({locations.length})</option>
            {STATUSES.map(s => {
              const cnt = locations.filter(l => l.status === s).length
              return (
                <option key={s} value={s}>
                  {LOCATION_STATUS_LABELS[s]} ({cnt})
                </option>
              )
            })}
          </select>
          <p className="text-xs text-onix-600 mt-1.5 leading-snug">
            {filterStatus
              ? `${pinsShown} on map for this status (${scoped.length} in status)`
              : `${pinsShown} on map of ${locations.length} shops`}
            {!filterStatus && missingCoords > 0 ? ` · ${missingCoords} lack coordinates` : null}
            {!filterStatus && geocodeCandidates > 0 ? ` · ${geocodeCandidates} with address to geocode` : null}
          </p>
        </div>
        <div className="space-y-1.5">
          {STATUSES.map(s => (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
              <span className="text-onix-600">{LOCATION_STATUS_LABELS[s]}</span>
            </div>
          ))}
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
        <div className="absolute bottom-6 left-60 bg-white border border-arctic-200 rounded-lg shadow-lg p-4 w-64 z-20">
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
