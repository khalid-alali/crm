import type { ActivationStateRow } from '@/lib/activation/types'
import { FREE_CONSULT_CHECKLIST_KEY } from '@/lib/expert-assist/free-consult'

const CHECKLIST_TIMESTAMP_FIELD: Record<string, keyof ActivationStateRow> = {
  card_on_file: 'card_added_at',
  owner_forward_clicked: 'owner_forward_clicked_at',
  service_writer_setup_email_sent: 'service_writer_setup_email_sent_at',
  counter_card_downloaded: 'counter_card_downloaded_at',
  welcome_kit_shipped: 'welcome_kit_shipped_at',
  printout_photo_received: 'printout_photo_received_at',
  qr_scanned: 'qr_first_scanned_at',
  [FREE_CONSULT_CHECKLIST_KEY]: 'free_consult_used_at',
}

/** Checklist keys written only by events / activation_state — not manual PATCH. */
export const AUTO_RESOLVED_EXPERT_ASSIST_CHECKLIST_KEYS = [
  'card_on_file',
  'owner_forward_clicked',
  'service_writer_setup_email_sent',
  'counter_card_downloaded',
  'printout_photo_received',
  'qr_scanned',
  FREE_CONSULT_CHECKLIST_KEY,
] as const

export const MANUAL_EXPERT_ASSIST_CHECKLIST_KEYS = ['welcome_kit_shipped'] as const

export function isAutoResolvedExpertAssistChecklistKey(itemKey: string): boolean {
  return (AUTO_RESOLVED_EXPERT_ASSIST_CHECKLIST_KEYS as readonly string[]).includes(itemKey)
}

export function activationFieldForChecklistKey(itemKey: string): keyof ActivationStateRow | null {
  return CHECKLIST_TIMESTAMP_FIELD[itemKey] ?? null
}

export function checklistCompletedAtFromActivation(
  itemKey: string,
  state: ActivationStateRow | null | undefined,
  opts?: {
    hasCardOnFile?: boolean
    freeConsultUsedAt?: string | null
  },
): string | null {
  const field = CHECKLIST_TIMESTAMP_FIELD[itemKey]
  if (field && state?.[field]) {
    return state[field] as string
  }

  if (itemKey === 'card_on_file' && opts?.hasCardOnFile && state?.card_added_at) {
    return state.card_added_at
  }

  if (itemKey === FREE_CONSULT_CHECKLIST_KEY) {
    return state?.free_consult_used_at ?? opts?.freeConsultUsedAt ?? null
  }

  if (itemKey === 'qr_scanned' && state && state.qr_scan_count > 0 && !state.qr_first_scanned_at) {
    return state.updated_at
  }

  return null
}

export function isExpertAssistChecklistItemReadOnly(
  itemKey: string,
  opts?: { hasCardOnFile?: boolean },
): boolean {
  if (isAutoResolvedExpertAssistChecklistKey(itemKey)) return true
  if (itemKey === 'card_on_file' && opts?.hasCardOnFile) return true
  return false
}
