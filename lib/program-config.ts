export const TESLA_PROGRAM_ID = 'tesla' as const
export const VINFAST_PROGRAM_ID = 'vinfast' as const

/** Programs whose checklist can be edited via program enrollment API routes. */
export const CHECKLIST_EDITABLE_PROGRAM_IDS: readonly string[] = [TESLA_PROGRAM_ID, VINFAST_PROGRAM_ID]

export type ProgramChecklistItem = {
  key: string
  label: string
  phase?: 1 | 2 | 3 | 4 | 5
  phaseLabel?: string
  owner?: 'fl' | 'vf' | 'shop'
  description?: string
  actionLabel?: string
  order?: number
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
        key: 'technical_training_scheduled',
        label: 'Schedule VinFast in-person Technical training',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        actionLabel: 'Schedule',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'portal_walkthrough',
        label: 'Conduct portal walkthrough',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 2,
        requiredForStage: false,
      },
      {
        key: 'vf_dealer_portal_stp_address',
        label: 'VinFast: Create dealer portal account and add shop address to STP address list',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'vf',
        order: 3,
        requiredForStage: false,
      },
      {
        key: 'vf_vci_shipped',
        label: 'VinFast: VCI: Ship scan tool to shop',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'vf',
        actionLabel: 'Request',
        order: 4,
        requiredForStage: false,
      },
      {
        key: 'dsa_vdsa_activated',
        label: 'DSA / VDSA Activated',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'shop',
        order: 5,
        requiredForStage: false,
      },
      {
        key: 'routable_payout_method_linked',
        label: 'Routable payout method linked',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        order: 0,
        requiredForStage: false,
      },
      {
        key: 'dsa_serial_logged',
        label: 'DSA: Log serial number in spreadsheet',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        actionLabel: 'Open',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'stock_parts_order',
        label: 'Stock parts order',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        actionLabel: 'Order',
        order: 2,
        requiredForStage: false,
      },
      {
        key: 'create_shop_profile',
        label: 'Create Shop Profile',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 6,
        requiredForStage: false,
      },
      {
        key: 'quickbooks_and_routable',
        label: 'Add shop to QuickBooks and Routable',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        order: 3,
        requiredForStage: false,
      },
      {
        key: 'technical_training_completed',
        label: 'Technical training completed',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'shop',
        order: 7,
        requiredForStage: false,
      },
      {
        key: 'owner_webinar_complete',
        label: 'Owner webinar complete',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        actionLabel: 'Resend invite',
        order: 4,
        requiredForStage: false,
      },
      {
        key: 'dsa_vdsa_received_sent',
        label: 'DSA / VDSA Account Received and Sent to Shop',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'fl',
        order: 5,
        requiredForStage: false,
      },
      {
        key: 'dsa_vdsa_requested',
        label: 'DSA / VDSA Account Requested',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 8,
        requiredForStage: false,
      },
      {
        key: 'wall_charger_ordered',
        label: 'Wall Charger Ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 9,
        requiredForStage: false,
      },
      {
        key: 'vci_ordered',
        label: 'VCI Ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'vf',
        order: 10,
        requiredForStage: false,
      },
      {
        key: 'vdsa_ordered',
        label: 'VDSA Ordered',
        phase: 2,
        phaseLabel: 'Setup, training & equipment',
        owner: 'fl',
        order: 11,
        requiredForStage: false,
      },
      {
        key: 'dsa_vdsa_portal_charger_ready',
        label: 'Shop has DSA/VDSA/Portal access and wall charger installed',
        phase: 3,
        phaseLabel: 'Ready for activation',
        owner: 'shop',
        order: 6,
        requiredForStage: false,
      },
      {
        key: 'shop_activated_vf',
        label: 'Shop Activated',
        phase: 4,
        phaseLabel: 'Activation',
        owner: 'fl',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'vinfast_notified',
        label: 'VinFast notified',
        phase: 4,
        phaseLabel: 'Activation',
        owner: 'fl',
        order: 2,
        requiredForStage: false,
      },
      {
        key: 'month_1_checkin_done',
        label: 'Month 1 check-in performed',
        phase: 5,
        phaseLabel: 'Post-activation check-ins',
        owner: 'fl',
        description: 'Auto-creates 30 days after activation',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'month_2_checkin_done',
        label: 'Month 2 check-in performed',
        phase: 5,
        phaseLabel: 'Post-activation check-ins',
        owner: 'fl',
        order: 2,
        requiredForStage: false,
      },
      {
        key: 'vf_notified',
        label: 'VF notified',
        phase: 5,
        phaseLabel: 'Post-activation check-ins',
        owner: 'vf',
        order: 3,
        requiredForStage: false,
      },
      {
        key: 'return_unused_parts',
        label: 'Return unused parts',
        phase: 5,
        phaseLabel: 'Post-activation check-ins',
        owner: 'shop',
        description: 'Required if churned',
        order: 4,
        requiredForStage: false,
      },
      {
        key: 'return_vf_equipment',
        label: 'Return VF Equipment',
        phase: 5,
        phaseLabel: 'Post-activation check-ins',
        owner: 'shop',
        description: 'Required if churned',
        order: 5,
        requiredForStage: false,
      },
      {
        key: 'labor_rate_requested',
        label: 'Labor Rate Requested',
        phase: 1,
        phaseLabel: 'Labor rate approval',
        owner: 'fl',
        order: 1,
        requiredForStage: false,
      },
      {
        key: 'labor_rate_approved',
        label: 'Labor Rate Approved',
        phase: 1,
        phaseLabel: 'Labor rate approval',
        owner: 'vf',
        order: 2,
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
