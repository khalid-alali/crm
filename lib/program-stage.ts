import { requiredChecklistKeys } from '@/lib/program-config'

export const TESLA_STAGES = [
  'not_ready',
  'getting_ready',
  'ready',
  'active',
  'disqualified',
] as const

export type TeslaStage = (typeof TESLA_STAGES)[number]

export function isTeslaStage(value: string): value is TeslaStage {
  return TESLA_STAGES.includes(value as TeslaStage)
}

export function deriveProgramStage(input: {
  programId: string
  checklistCompletedKeys: string[]
  firstJobCompletedAt: string | null
  currentStage?: TeslaStage
  manualStageOverride?: boolean
}): TeslaStage {
  const {
    programId,
    checklistCompletedKeys,
    firstJobCompletedAt,
    currentStage,
    manualStageOverride = false,
  } = input

  if (currentStage === 'disqualified') return 'disqualified'
  if (manualStageOverride && currentStage && isTeslaStage(currentStage)) return currentStage
  if (firstJobCompletedAt) return 'active'

  const requiredKeys = requiredChecklistKeys(programId)
  if (requiredKeys.length === 0) return 'not_ready'

  const completed = new Set(checklistCompletedKeys)
  const completedCount = requiredKeys.filter(key => completed.has(key)).length

  if (completedCount === 0) return 'not_ready'
  if (completedCount === requiredKeys.length) return 'ready'
  return 'getting_ready'
}

export function getMissingChecklistKeys(programId: string, completedKeys: string[]): string[] {
  const completed = new Set(completedKeys)
  return requiredChecklistKeys(programId).filter(key => !completed.has(key))
}
