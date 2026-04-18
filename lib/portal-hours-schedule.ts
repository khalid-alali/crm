export const PORTAL_HOURS_VERSION = 1 as const

export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayId = (typeof DAY_ORDER)[number]

export const DAY_LABELS: Record<DayId, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

export type DaySlot = { closed: boolean; open: string; close: string }

export type PortalHoursModel = {
  _v: typeof PORTAL_HOURS_VERSION
  days: Record<DayId, DaySlot>
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** 30-minute steps, 6:00–22:00 (store as HH:MM 24h). */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m > 0) break
      out.push(`${pad2(h)}:${pad2(m)}`)
    }
  }
  return out
})()

export function defaultPortalHoursModel(): PortalHoursModel {
  const open: DaySlot = { closed: false, open: '08:00', close: '17:00' }
  const closed: DaySlot = { closed: true, open: '08:00', close: '17:00' }
  return {
    _v: PORTAL_HOURS_VERSION,
    days: {
      mon: { ...open },
      tue: { ...open },
      wed: { ...open },
      thu: { ...open },
      fri: { ...open },
      sat: { ...closed },
      sun: { ...closed },
    },
  }
}

function isDaySlot(v: unknown): v is DaySlot {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.closed === 'boolean' &&
    typeof o.open === 'string' &&
    typeof o.close === 'string'
  )
}

export function tryParsePortalHoursJson(raw: string): PortalHoursModel | null {
  const t = raw.trim()
  if (!t.startsWith('{')) return null
  try {
    const j = JSON.parse(t) as unknown
    if (!j || typeof j !== 'object') return null
    const o = j as Record<string, unknown>
    if (o._v !== PORTAL_HOURS_VERSION) return null
    const days = o.days
    if (!days || typeof days !== 'object') return null
    const d = days as Record<string, unknown>
    const out: Partial<Record<DayId, DaySlot>> = {}
    for (const id of DAY_ORDER) {
      const slot = d[id]
      if (!isDaySlot(slot)) return null
      out[id] = slot
    }
    return { _v: PORTAL_HOURS_VERSION, days: out as Record<DayId, DaySlot> }
  } catch {
    return null
  }
}

export function isValidTimeSlot(t: string): boolean {
  return TIME_OPTIONS.includes(t)
}

export function validatePortalHoursModel(m: PortalHoursModel): string | null {
  let anyOpen = false
  for (const id of DAY_ORDER) {
    const d = m.days[id]
    if (!d) return 'Missing day row'
    if (d.closed) continue
    anyOpen = true
    if (!isValidTimeSlot(d.open) || !isValidTimeSlot(d.close)) return 'Invalid open or close time'
    if (d.open >= d.close) return 'Closing time must be after opening time'
  }
  if (!anyOpen) return 'Choose hours for at least one open day'
  return null
}

export function stringifyPortalHours(m: PortalHoursModel): string {
  return JSON.stringify(m)
}

function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suf}` : `${h12}:${pad2(m)} ${suf}`
}

function slotSignature(s: DaySlot): string {
  if (s.closed) return 'closed'
  return `${s.open}|${s.close}`
}

/** Human-readable summary for admin UI / detail views. */
export function summarizePortalHours(m: PortalHoursModel): string {
  const parts: string[] = []
  let i = 0
  while (i < DAY_ORDER.length) {
    const id = DAY_ORDER[i]
    const sig = slotSignature(m.days[id])
    let j = i + 1
    while (j < DAY_ORDER.length && slotSignature(m.days[DAY_ORDER[j]]) === sig) j++
    const range =
      i === j - 1
        ? DAY_LABELS[DAY_ORDER[i]]
        : `${DAY_LABELS[DAY_ORDER[i]]}–${DAY_LABELS[DAY_ORDER[j - 1]]}`
    const s = m.days[id]
    if (s.closed) parts.push(`${range}: closed`)
    else parts.push(`${range}: ${formatTime12(s.open)}–${formatTime12(s.close)}`)
    i = j
  }
  return parts.join('; ')
}

export function formatHoursForDisplay(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const m = tryParsePortalHoursJson(t)
  if (!m) return t
  const err = validatePortalHoursModel(m)
  if (err) return t
  return summarizePortalHours(m)
}
