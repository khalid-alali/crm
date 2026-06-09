export const TESLA_PROGRAM_ID = 'tesla' as const
export const VINFAST_PROGRAM_ID = 'vinfast' as const
export const EXPERT_ASSIST_PROGRAM_ID = 'expert_assist' as const

/** Programs whose checklist can be edited via program enrollment API routes. */
export const CHECKLIST_EDITABLE_PROGRAM_IDS: readonly string[] = [
  TESLA_PROGRAM_ID,
  VINFAST_PROGRAM_ID,
  EXPERT_ASSIST_PROGRAM_ID,
]

export type ChecklistPrerequisite =
  | string
  | { phaseComplete: 1 | 2 | 3 | 4 | 5 }
  | { afterItem: string; delayDays: number }

export type ProgramChecklistItem = {
  key: string
  label: string
  phase?: 1 | 2 | 3 | 4 | 5
  phaseLabel?: string
  owner?: 'fl' | 'vf' | 'shop'
  description?: string
  /** Multi-line help shown next to the label in the Programs checklist (e.g. admin setup steps). */
  tooltip?: string
  actionLabel?: string
  order?: number
  /** VinFast: hide until satisfied; UI-only (not enforced on PATCH). */
  prerequisites?: ChecklistPrerequisite[]
  /**
   * When false, the item is still stored in `program_enrollment_checklist` but is ignored for
   * derived stage transitions (`getting_ready` → `ready`). Default true.
   */
  requiredForStage?: boolean
}

/** Tracked in checklist UI; optional for stage derivation; auto-complete for active VinFast shops. */
export const TESLA_FIXLANE_ACCOUNT_READY_KEY = 'fixlane_account_ready' as const
/** Tracked in checklist UI; optional for stage derivation; auto-complete for active VinFast shops. */
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
      {
        key: TESLA_FIXLANE_ACCOUNT_READY_KEY,
        label: 'Fixlane account ready',
        requiredForStage: false,
      },
    ],
  },
  multidrive: {
    id: 'multidrive',
    label: 'Multi-drive',
    checklist: [{ key: 'diagnostics', label: 'Diagnostics setup' }],
  },
  vinfast: {
    id: VINFAST_PROGRAM_ID,
    label: 'VinFast',
    checklist: [
      {
        key: 'welcome_email_sent',
        label: 'Send welcome email',
        phase: 1,
        phaseLabel: 'Labor rate approval',
        owner: 'fl',
        actionLabel: 'Email',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'labor_rate_requested',
        label: 'Labor rate requested from VinFast',
        phase: 1,
        phaseLabel: 'Labor rate approval',
        owner: 'fl',
        order: 2,
        prerequisites: ['welcome_email_sent'],
        requiredForStage: false,
      },
      {
        key: 'labor_rate_approved',
        label: 'Labor rate approved',
        phase: 1,
        phaseLabel: 'Labor rate approval',
        owner: 'vf',
        order: 3,
        prerequisites: ['labor_rate_requested'],
        requiredForStage: false,
      },
      {
        key: 'vf_email_sent',
        label: 'Request VinFast IT Setup',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        actionLabel: 'Email',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'wall_charger_ordered',
        label: 'Wall charger ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        actionLabel: 'Order',
        order: 2,
        requiredForStage: false,
      },
      {
        key: 'vci_ordered',
        label: 'VCI ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 3,
        requiredForStage: false,
      },
      {
        key: 'vdsa_ordered',
        label: 'VDSA ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 4,
        requiredForStage: false,
      },
      {
        key: 'add_shop_to_quickbooks_and_routable',
        label: 'Add shop to QuickBooks and Routable',
        phase: 3,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        actionLabel: 'Add',
        order: 5,
        requiredForStage: false,
      },
      {
        key: 'dsa_vdsa_account_requested',
        label: 'DSA / VDSA account requested',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 6,
        prerequisites: ['vdsa_ordered'],
        requiredForStage: false,
      },
      {
        key: 'vf_dealer_portal_account_created',
        label: 'VinFast: dealer portal account created and shop added to STP address list',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'vf',
        order: 7,
        prerequisites: ['dsa_vdsa_account_requested'],
        requiredForStage: false,
      },
      {
        key: 'vci_shipped',
        label: 'VinFast: VCI shipped to shop',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'vf',
        actionLabel: 'Request',
        order: 8,
        prerequisites: ['vci_ordered', 'vf_dealer_portal_account_created'],
        requiredForStage: false,
      },
      {
        key: 'technical_training_scheduled',
        label: 'Technical training scheduled',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        actionLabel: 'Schedule',
        order: 9,
        requiredForStage: false,
      },
      {
        key: 'technical_training_completed',
        label: 'Technical training completed',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'shop',
        order: 10,
        prerequisites: ['technical_training_scheduled'],
        requiredForStage: false,
      },
      {
        key: 'conduct_portal_walkthrough',
        label: 'Conduct portal walkthrough',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 11,
        prerequisites: [],
        requiredForStage: false,
      },
      {
        key: 'dsa_serial_logged',
        label: 'DSA: log serial number in spreadsheet',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        actionLabel: 'Open',
        order: 1,
        prerequisites: ['dsa_vdsa_account_requested'],
        requiredForStage: false,
      },
      {
        key: 'wall_charger_installed',
        label: 'Wall charger installed at shop',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        order: 2,
        prerequisites: ['wall_charger_ordered'],
        requiredForStage: false,
      },
      {
        key: 'owner_webinar_complete',
        label: 'Owner webinar complete',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        actionLabel: 'Resend invite',
        order: 3,
        requiredForStage: false,
      },
      {
        key: 'shop_has_full_access_and_charger',
        label: 'Shop has DSA, VDSA, portal access and wall charger installed',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        order: 4,
        prerequisites: ['dsa_vdsa_account_requested', 'wall_charger_installed'],
        requiredForStage: false,
      },
      {
        key: 'stock_parts_order_placed',
        label: 'Order stock parts',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        actionLabel: 'Order',
        order: 5,
        requiredForStage: false,
      },
      {
        key: 'routable_payout_method_linked',
        label: 'Routable payout method linked',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        order: 6,
        prerequisites: ['add_shop_to_quickbooks_and_routable'],
        requiredForStage: false,
      },
      {
        key: 'go_live_week_set',
        label: 'Go-live week set',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        order: 7,
        prerequisites: ['shop_has_full_access_and_charger', 'routable_payout_method_linked'],
        requiredForStage: false,
      },
      {
        key: 'shop_activated',
        label: 'Shop activated in Fixlane',
        phase: 4,
        phaseLabel: 'Activation',
        owner: 'fl',
        order: 1,
        prerequisites: [{ phaseComplete: 3 }],
        requiredForStage: false,
      },
      {
        key: 'vinfast_notified_of_activation',
        label: 'VinFast notified of activation',
        phase: 4,
        phaseLabel: 'Activation',
        owner: 'fl',
        order: 2,
        prerequisites: ['shop_activated'],
        requiredForStage: false,
      },
      {
        key: 'first_booking_received',
        label: 'First booking received',
        phase: 4,
        phaseLabel: 'Activation',
        owner: 'shop',
        order: 3,
        prerequisites: ['shop_activated'],
        requiredForStage: false,
      },
      {
        key: 'month_1_check_in',
        label: 'Month 1 check-in performed',
        phase: 5,
        phaseLabel: 'Post-activation',
        owner: 'fl',
        description: 'Unlocks 30 days after Shop activated in Fixlane',
        order: 1,
        prerequisites: [{ afterItem: 'shop_activated', delayDays: 30 }],
        requiredForStage: false,
      },
      {
        key: 'month_2_check_in',
        label: 'Month 2 check-in performed',
        phase: 5,
        phaseLabel: 'Post-activation',
        owner: 'fl',
        order: 2,
        prerequisites: ['month_1_check_in'],
        requiredForStage: false,
      },
    ],
  },
  expert_assist: {
    id: EXPERT_ASSIST_PROGRAM_ID,
    label: 'Expert Assist',
    checklist: [
      { key: 'card_on_file', label: 'Card on file', requiredForStage: false },
      { key: 'owner_forward_clicked', label: 'Owner-forward clicked', requiredForStage: false },
      { key: 'front_desk_sms_delivered', label: 'Front desk SMS delivered', requiredForStage: false },
      { key: 'counter_card_downloaded', label: 'Counter card downloaded', requiredForStage: false },
      { key: 'welcome_kit_shipped', label: 'Welcome kit shipped', requiredForStage: false },
      { key: 'printout_photo_received', label: 'Printout photo received', requiredForStage: false },
      { key: 'qr_scanned', label: 'QR scanned', requiredForStage: false },
      {
        key: 'free_consult_used',
        label: 'Free consult used',
        tooltip: 'Auto-set when the shop\'s first consult closes successfully.',
        requiredForStage: false,
      },
    ],
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

/** All checklist keys accepted for PATCH (includes optional checklist items). */
export function programChecklistKeys(programId: string): string[] {
  const config = getProgramConfig(programId)
  if (!config) return []
  return config.checklist.map(item => item.key)
}
