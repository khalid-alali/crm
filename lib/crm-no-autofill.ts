/**
 * Props for internal CRM fields that hold third-party data (shop contacts, etc.).
 * Reduces Chrome autofill and signals password managers to stay away.
 * @see https://bitwarden.com/help/relevant-word-autofill/ (data-bwignore)
 */
export const crmInputNoAutofillProps = {
  autoComplete: 'off',
  'data-bwignore': 'true',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-form-type': 'other',
} as const

export const crmSelectNoAutofillProps = {
  autoComplete: 'off',
  'data-bwignore': 'true',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
} as const
