// Generic JSONB survey engine shared by the shop site survey and the technician
// competency survey. The capabilities survey stays bespoke (typed columns on
// locations); these two store free-form answers in a `responses` JSONB column,
// so one catalog + one renderer drives both.

export type SurveyOption = { value: string; label: string }

export type SurveyQuestionType =
  | 'text'
  | 'tel'
  | 'email'
  | 'number'
  | 'yesno'
  | 'single' // radio, one of options
  | 'multi' // checkboxes, many of options

export type SurveyQuestion = {
  key: string
  label: string
  type: SurveyQuestionType
  required?: boolean
  options?: SurveyOption[] // single | multi
  help?: string
  placeholder?: string
  readOnly?: boolean
  /** Link a phrase inside `label` (must match exactly once). */
  labelLink?: { text: string; href: string }
}

export type SurveySection = { title?: string; intro?: string; questions: SurveyQuestion[] }

export type SurveySpec = {
  id: string
  title: string
  intro?: string
  sections: SurveySection[]
}

// yesno → 'yes' | 'no'; single → option value; multi → option values; number → number.
export type SurveyResponseValue = string | string[] | number | null
export type SurveyResponses = Record<string, SurveyResponseValue>

export function allQuestions(spec: SurveySpec): SurveyQuestion[] {
  return spec.sections.flatMap(s => s.questions)
}

export function isAnswered(q: SurveyQuestion, v: SurveyResponseValue | undefined): boolean {
  if (v === undefined || v === null) return false
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0
  if (q.type === 'number') return typeof v === 'number' && !Number.isNaN(v)
  return typeof v === 'string' ? v.trim().length > 0 : true
}

/** Required questions that are not yet answered. */
export function missingRequired(spec: SurveySpec, responses: SurveyResponses): SurveyQuestion[] {
  return allQuestions(spec).filter(q => q.required && !isAnswered(q, responses[q.key]))
}

export function answeredCount(spec: SurveySpec, responses: SurveyResponses): number {
  return allQuestions(spec).filter(q => isAnswered(q, responses[q.key])).length
}
