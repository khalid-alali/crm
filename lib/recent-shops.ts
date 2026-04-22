export const RECENT_SHOPS_STORAGE_KEY = 'fixlane_recent_shops_v1'
export const MAX_RECENT_SHOPS = 5

export type RecentShop = {
  id: string
  name: string
  status: string | null
  city: string | null
  state: string | null
  visitedAt: number
}

function isRecentShop(value: unknown): value is RecentShop {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.id === 'string' &&
    typeof rec.name === 'string' &&
    (typeof rec.status === 'string' || rec.status === null) &&
    (typeof rec.city === 'string' || rec.city === null) &&
    (typeof rec.state === 'string' || rec.state === null) &&
    typeof rec.visitedAt === 'number'
  )
}

export function readRecentShops(): RecentShop[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_SHOPS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentShop).sort((a, b) => b.visitedAt - a.visitedAt).slice(0, MAX_RECENT_SHOPS)
  } catch {
    return []
  }
}

export function writeRecentShop(shop: Omit<RecentShop, 'visitedAt'>) {
  if (typeof window === 'undefined') return
  const next: RecentShop = { ...shop, visitedAt: Date.now() }
  const deduped = readRecentShops().filter(item => item.id !== shop.id)
  const merged = [next, ...deduped].slice(0, MAX_RECENT_SHOPS)
  window.localStorage.setItem(RECENT_SHOPS_STORAGE_KEY, JSON.stringify(merged))
}
