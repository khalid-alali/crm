export const BDR_ASSIGNEES = ['Leo', 'Dave'] as const
export type BdrAssignee = (typeof BDR_ASSIGNEES)[number]

export const DEFAULT_BDR_ASSIGNEE: BdrAssignee = 'Leo'

export function isBdrAssignee(v: string | null | undefined): v is BdrAssignee {
  return v === 'Leo' || v === 'Dave'
}

/** Coerce stored or form values to a valid BDR assignee (legacy rows default to Leo). */
export function normalizeBdrAssignedTo(v: string | null | undefined): BdrAssignee {
  return isBdrAssignee(v) ? v : DEFAULT_BDR_ASSIGNEE
}
