/** Human-readable labels for `locations.status` (DB enum values unchanged). */
export const LOCATION_STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  in_review: 'In Review',
  contracted: 'Signed',
  active: 'Active',
  inactive: 'Churned',
}

function pipelineStatusLabel(value: string) {
  return LOCATION_STATUS_LABELS[value] ?? value
}

/** Rewrite `Bulk update: from → to` using display labels (e.g. contracted → Signed). */
export function formatBulkPipelineStatusLogBody(body: string): string {
  const firstLine = body.split('\n')[0] ?? ''
  const m = firstLine.match(/^Bulk update:\s*([^→]+?)\s*→\s*(.+)$/)
  if (!m) return body
  const from = pipelineStatusLabel(m[1].trim())
  const to = pipelineStatusLabel(m[2].trim())
  const rest = body.slice(firstLine.length)
  return `Bulk update: ${from} → ${to}` + rest
}
