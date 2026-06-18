import type { FacilitySurveyRow } from '@/lib/vinfast-readiness'

/** PostgREST may return one-to-one embeds as an object or a single-element array. */
export function pickFacilitySurvey(raw: unknown): FacilitySurveyRow | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw.length > 0 ? (raw[0] as FacilitySurveyRow) : null
  if (typeof raw === 'object') return raw as FacilitySurveyRow
  return null
}
