export const TESLA_PROGRAM_ID = 'tesla' as const

export type ProgramChecklistItem = {
  key: string
  label: string
}

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
  return config.checklist.map(item => item.key)
}
