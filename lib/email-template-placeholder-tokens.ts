/** Tokens available in template editor + send-email modal (merge fields; body insert / subject append). */
export const EMAIL_MERGE_PLACEHOLDER_TOKENS = [
  '{{contact_first_name}}',
  '{{contact_full_name}}',
  '{{shop_name}}',
  '{{shop_address}}',
  '{{shop_city}}',
  '{{shop_state}}',
  '{{vinfast_store_code}}',
  '{{dealer_code}}',
  '{{sender_first_name}}',
  '{{sender_full_name}}',
] as const

/** Use via the body toolbar Link popover (not the merge-field sidebar). */
export const CAPABILITIES_LINK_PLACEHOLDER = '{{capabilities_link}}' as const

/** Expert Assist web intake — use via the body toolbar Link popover (not the merge-field sidebar). */
export const EXPERT_ASSIST_LINK_PLACEHOLDER = '{{expert_assist_link}}' as const

/** Shop onboarding portal (/portal/<token>/onboarding) — use via the body toolbar Link popover. */
export const ENROLLMENT_PORTAL_LINK_PLACEHOLDER = '{{enrollment_portal_link}}' as const

/** Direct Routable embedded bank-link URL — minted on send (E2/E3). Use via the body toolbar Link popover. */
export const ROUTABLE_BANK_LINK_PLACEHOLDER = '{{routable_bank_link}}' as const
