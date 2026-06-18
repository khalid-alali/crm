import { requiredChecklistKeys, TESLA_PROGRAM_ID } from '@/lib/program-config'

export const TESLA_STAGES = [
  'not_ready',
  'getting_ready',
  'ready',
  'active',
  'disqualified',
] as const

export type TeslaStage = (typeof TESLA_STAGES)[number]

/** Tesla kanban / county table columns (shops enter via Enroll at onboarding). */
export const TESLA_KANBAN_STAGES = ['getting_ready', 'ready', 'active'] as const satisfies readonly TeslaStage[]

export const TESLA_STAGE_DISPLAY: Record<TeslaStage, { label: string; tooltip?: string }> = {
  not_ready: { label: 'Onboarding' },
  getting_ready: { label: 'Onboarding' },
  ready: {
    label: 'Pending first Tesla job',
    tooltip: 'Shop has not yet completed a Tesla job through the platform.',
  },
  active: {
    label: 'Completed Tesla job',
    tooltip: 'Completed on-platform Tesla job',
  },
  disqualified: { label: 'Disqualified' },
}

export function isTeslaStage(value: string): value is TeslaStage {
  return TESLA_STAGES.includes(value as TeslaStage)
}

/** Legacy `not_ready` rows render in the Onboarding column. */
export function teslaKanbanDisplayStage(stage: TeslaStage): TeslaStage {
  return stage === 'not_ready' ? 'getting_ready' : stage
}

export function teslaStageLabel(stage: string): string {
  return isTeslaStage(stage) ? TESLA_STAGE_DISPLAY[stage].label : stage
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
  if (requiredKeys.length === 0) {
    return programId === TESLA_PROGRAM_ID ? 'getting_ready' : 'not_ready'
  }

  const completed = new Set(checklistCompletedKeys)
  const completedCount = requiredKeys.filter(key => completed.has(key)).length

  if (completedCount === 0) {
    return programId === TESLA_PROGRAM_ID ? 'getting_ready' : 'not_ready'
  }
  if (completedCount === requiredKeys.length) return 'ready'
  return 'getting_ready'
}

export function getMissingChecklistKeys(programId: string, completedKeys: string[]): string[] {
  const completed = new Set(completedKeys)
  return requiredChecklistKeys(programId).filter(key => !completed.has(key))
}
