import { eaPillClass, QUEUE_PILL_LABELS } from '@/components/expert-assist/ea-ui'
import type { QueuePillKind } from '@/lib/expert-assist/queue-display'

export default function ConsultQueuePill({ kind }: { kind: QueuePillKind }) {
  return <span className={eaPillClass(kind)}>{QUEUE_PILL_LABELS[kind]}</span>
}
