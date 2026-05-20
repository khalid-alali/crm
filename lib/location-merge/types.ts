export type MergeColumnMeta = {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: string
  character_maximum_length: number | null
}

export type MergeFieldType = 'conflict' | 'autofill' | 'unchanged'

export type MergeFieldPreview = {
  key: string
  primary: unknown
  secondary: unknown
  default: unknown
  type: MergeFieldType
  requiresConfirmation?: boolean
}

export type LocationMergeScore = {
  fieldScore: number
  contacts: number
  contracts: number
  programEnrollments: number
  checklistFields: number
  total: number
}

export type ChecklistFieldPreview = {
  key: string
  primary: unknown
  secondary: unknown
  default: unknown
  type: MergeFieldType
}

export type ProgramMergePreview = {
  program: string
  resolution: 'keep_primary' | 'keep_secondary' | 'move_secondary' | 'none'
  primaryStage?: string | null
  secondaryStage?: string | null
  checklist?: {
    primaryFieldsPopulated: number
    secondaryFieldsPopulated: number
    conflicts: number
    fields: ChecklistFieldPreview[]
  }
}

export type MergePreviewResponse = {
  primary: { id: string; name: string; score: number; updatedAt: string }
  secondary: { id: string; name: string; score: number; updatedAt: string }
  scoreBreakdown: {
    primary: LocationMergeScore
    secondary: LocationMergeScore
  }
  autoPickReason: string
  fields: MergeFieldPreview[]
  relational: {
    contacts: { moving: number; deduped: number }
    contracts: { moving: number; legalEntityWarning: boolean; legalEntityNames: string[] }
    activityEntries: number
    openTasks: number
    openTasksDeduped: number
    programs: ProgramMergePreview[]
  }
  warnings: {
    disqualifiedInvolved: boolean
    requiresDisqualifiedConfirmation: boolean
  }
}

export type MergeCommitBody = {
  primaryId: string
  secondaryId: string
  fieldOverrides?: Record<string, unknown>
  programOverrides?: Array<{
    program: string
    enrollment: 'primary' | 'secondary'
    checklistFieldOverrides?: Record<string, { completed_at?: string | null; notes?: string | null }>
  }>
  legalEntityAcknowledged?: boolean
  disqualifiedAcknowledged?: boolean
  previewSnapshot?: {
    primaryUpdatedAt: string
    secondaryUpdatedAt: string
  }
}
