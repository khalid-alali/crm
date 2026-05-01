/** Tokens available in template editor + send-email modal (merge fields; body insert / subject append). */
export const EMAIL_MERGE_PLACEHOLDER_TOKENS = [
  '{{contact_first_name}}',
  '{{contact_full_name}}',
  '{{shop_name}}',
  '{{shop_city}}',
  '{{shop_state}}',
  '{{sender_first_name}}',
  '{{sender_full_name}}',
] as const

/** Use via the body toolbar Link popover (not the merge-field sidebar). */
export const CAPABILITIES_LINK_PLACEHOLDER = '{{capabilities_link}}' as const
