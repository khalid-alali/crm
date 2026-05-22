/** Location statuses that advance to `prospect` when a Zoho contract is sent. */
export const STATUSES_BEFORE_PROSPECT = [
  'lead',
  'contacted',
  'dormant',
  'in_review',
] as const

/** Early pipeline statuses that advance to `contracted` when a Zoho contract is signed. */
export const STATUSES_BEFORE_CONTRACTED = [
  'lead',
  'contacted',
  'prospect',
  'dormant',
  'in_review',
] as const
