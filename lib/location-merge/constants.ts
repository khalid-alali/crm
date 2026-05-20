import { TESLA_STAGES } from '@/lib/program-stage'

/** Per-column merge behavior overrides (type-based rules apply when not listed). */
export const MERGE_OVERRIDES: Record<
  string,
  | 'most_advanced_status'
  | 'require_confirmation'
  | 'earlier'
  | 'concatenate'
> = {
  status: 'most_advanced_status',
  disqualified_at: 'require_confirmation',
  disqualified_reason: 'require_confirmation',
  disqualified_notes: 'require_confirmation',
  capabilities_submitted_at: 'earlier',
  notes: 'concatenate',
  note: 'concatenate',
  consult_internal_notes: 'concatenate',
}

/** Pipeline `locations.status` ordering (higher = more advanced). */
export const PIPELINE_STATUS_RANK: Record<string, number> = {
  lead: 1,
  contacted: 2,
  dormant: 3,
  in_review: 4,
  contracted: 5,
  active: 6,
  inactive: 7,
}

export const LEGACY_PROGRAM_STATUS_RANK: Record<string, number> = {
  not_enrolled: 0,
  pending_activation: 1,
  suspended: 2,
  terminated: 3,
  active: 4,
}

export const PROGRAM_STAGE_RANK: Record<string, number> = Object.fromEntries(
  TESLA_STAGES.map((s, i) => [s, i]),
) as Record<string, number>

export const NOTES_LIKE_NAME_RE = /(?:^|_)(notes|description)(?:$|_)/i

export const MERGE_NOTES_SEPARATOR = '\n\n---\n\n'
