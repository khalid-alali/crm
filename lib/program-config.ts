export const TESLA_PROGRAM_ID = 'tesla' as const

export type ProgramChecklistItem = {
  key: string
  label: string
  /**
   * When false, the item is still stored in `program_enrollment_checklist` but is ignored for
   * derived stage transitions (`getting_ready` → `ready`). Default true.
   */
  requiredForStage?: boolean
}

/** Tracked in checklist UI; optional for stage derivation; auto-complete for VinFast shops. */
export const TESLA_PORTAL_WALKTHROUGH_KEY = 'portal_walkthrough' as const

export type ProgramConfig = {
  id: string
  label: string
  checklist: ProgramChecklistItem[]
}

const PROGRAM_CONFIGS: Record<string, ProgramConfig> = {
  tesla: {
    id: TESLA_PROGRAM_ID,
    label: 'Tesla',
    checklist: [
      { key: 'epc', label: 'EPC' },
      { key: 'toolbox', label: 'Toolbox' },
      { key: 'laptop', label: 'Laptop' },
      { key: 'cables', label: 'Cables' },
      {
        key: TESLA_PORTAL_WALKTHROUGH_KEY,
        label: 'Portal walkthrough',
        requiredForStage: false,
      },
    ],
  },
  multidrive: {
    id: 'multidrive',
    label: 'Multi-drive',
    checklist: [{ key: 'diagnostics', label: 'Diagnostics setup' }],
  },
}

export function getProgramConfig(programId: string): ProgramConfig | null {
  return PROGRAM_CONFIGS[programId] ?? null
}

export function requiredChecklistKeys(programId: string): string[] {
  const config = getProgramConfig(programId)
  if (!config) return []
  return config.checklist.filter(item => item.requiredForStage !== false).map(item => item.key)
}

/** All checklist keys accepted for PATCH (includes optional items like portal walkthrough). */
export function programChecklistKeys(programId: string): string[] {
  const config = getProgramConfig(programId)
  if (!config) return []
  return config.checklist.map(item => item.key)
}
