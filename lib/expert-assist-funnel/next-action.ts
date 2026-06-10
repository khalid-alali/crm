import type { ActivationStateRow } from '@/lib/activation/types'
import type { ExpertAssistFunnelStage } from '@/lib/expert-assist-funnel/stages'

const ACTIVATION_CHECKLIST_ORDER = [
  'card_on_file',
  'front_desk_sms_delivered',
  'owner_forward_clicked',
  'counter_card_downloaded',
  'welcome_kit_shipped',
  'printout_photo_received',
] as const

const ACTIVATION_GAP_FIELD: Record<
  (typeof ACTIVATION_CHECKLIST_ORDER)[number],
  keyof ActivationStateRow
> = {
  card_on_file: 'card_added_at',
  front_desk_sms_delivered: 'front_desk_sms_delivered_at',
  owner_forward_clicked: 'owner_forward_clicked_at',
  counter_card_downloaded: 'counter_card_downloaded_at',
  welcome_kit_shipped: 'welcome_kit_shipped_at',
  printout_photo_received: 'printout_photo_received_at',
}

type ChecklistItem = {
  itemKey: string
  label: string
  completedAt: string | null
}

function nextActionFromActivationGaps(
  checklist: ChecklistItem[],
  activationState: ActivationStateRow | null | undefined,
): string | null {
  if (!activationState) return null

  for (const key of ACTIVATION_CHECKLIST_ORDER) {
    const field = ACTIVATION_GAP_FIELD[key]
    if (!activationState[field]) {
      const item = checklist.find(row => row.itemKey === key)
      if (item) return item.label
    }
  }

  return null
}

export function deriveExpertAssistNextAction(input: {
  stage: ExpertAssistFunnelStage
  signupComplete: boolean
  hasInboundSms: boolean
  closedConsultCount: number
  checklist: ChecklistItem[]
  activationState?: ActivationStateRow | null
}): string {
  const fromActivation = nextActionFromActivationGaps(input.checklist, input.activationState)
  if (fromActivation) return fromActivation

  for (const key of ACTIVATION_CHECKLIST_ORDER) {
    const item = input.checklist.find(row => row.itemKey === key)
    if (item && !item.completedAt) return item.label
  }

  if (!input.signupComplete) return 'Complete Expert Assist signup'
  if (!input.hasInboundSms) return 'Get first inbound SMS from shop'
  if (input.closedConsultCount === 0) return 'Complete first consult'
  if (input.closedConsultCount === 1) return 'Complete second consult'
  if (input.stage === 'dormant') return 'Re-engage shop — dormant'
  return 'Shop activated — monitor usage'
}
