import { expertAssistSurfacesBaseUrl } from '@/lib/expert-assist-surfaces-base-url'
import type { NextRequest } from 'next/server'

/** Shop-facing web thread URL (path uses shop location UUID). */
export function shopConsultThreadUrl(locationId: string, caseId: string, req?: NextRequest): string {
  const base = expertAssistSurfacesBaseUrl(req)
  return `${base}/s/${encodeURIComponent(locationId)}/consult/${encodeURIComponent(caseId)}`
}
