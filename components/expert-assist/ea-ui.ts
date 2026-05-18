import type { QueuePillKind } from '@/lib/expert-assist/queue-display'

export const QUEUE_PILL_LABELS: Record<QueuePillKind, string> = {
  new: 'New',
  shop_replied: 'Shop replied',
  awaiting_shop: 'Awaiting shop',
}

export function eaPillClass(kind: QueuePillKind): string {
  if (kind === 'shop_replied') return 'ea-pill ea-pill-shop-replied'
  if (kind === 'awaiting_shop') return 'ea-pill ea-pill-awaiting'
  return 'ea-pill ea-pill-new'
}
