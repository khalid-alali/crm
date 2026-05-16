const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/i

const nhtsaCache = new Map<string, { year: string | null; model: string | null; trim: string | null; at: number }>()
const NHTSA_TTL_MS = 1000 * 60 * 60 * 24

export function extractVinFromText(text: string): string | null {
  const m = text.match(VIN_RE)
  return m ? m[1].toUpperCase() : null
}

export async function decodeVinNhtsa(vin: string): Promise<{
  year: string | null
  model: string | null
  trim: string | null
} | null> {
  const v = vin.trim().toUpperCase()
  if (v.length !== 17) return null

  const hit = nhtsaCache.get(v)
  if (hit && Date.now() - hit.at < NHTSA_TTL_MS) {
    return { year: hit.year, model: hit.model, trim: hit.trim }
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(v)}?format=json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as {
    Results?: Array<Record<string, string>>
  }
  const row = data.Results?.[0]
  if (!row) return null

  const year = row.ModelYear?.trim() || null
  const model = row.Model?.trim() || null
  const trim = row.Trim?.trim() || row.Series?.trim() || null

  nhtsaCache.set(v, { year, model, trim, at: Date.now() })
  return { year, model, trim }
}
