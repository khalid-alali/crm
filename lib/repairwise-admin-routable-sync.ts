const DEFAULT_UPDATE_ROUTABLE_URL =
  'http://app.repairwise.pro/api/v1/shop/webhook/update_routable_id'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export type SyncRoutableToAdminInput = {
  adminShopId: string
  routableId: string
}

export type SyncRoutableToAdminResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; status: number }
  | { ok: false; error: string; status?: number }

/** True when CRM has Routable enrolled but admin shop was not linked until now. */
export function shouldSyncRoutableToAdminOnLink(input: {
  previousAdminShopId: string | null | undefined
  routableId: string | null | undefined
}): boolean {
  if (cleanText(input.previousAdminShopId)) return false
  return Boolean(cleanText(input.routableId))
}

export function repairwiseUpdateRoutableWebhookConfig(): {
  url: string
  secret: string
} | null {
  const url = cleanText(process.env.REPAIRWISE_UPDATE_ROUTABLE_WEBHOOK_URL) || DEFAULT_UPDATE_ROUTABLE_URL
  const secret = cleanText(process.env.REPAIRWISE_SHOP_WEBHOOK_SECRET)
  if (!secret) return null
  return { url, secret }
}

/** POST admin shop id + Routable company id to RepairWise admin after CRM admin link. */
export async function syncRoutableIdToRepairwiseAdmin(
  input: SyncRoutableToAdminInput,
): Promise<SyncRoutableToAdminResult> {
  const adminShopId = cleanText(input.adminShopId)
  const routableId = cleanText(input.routableId)
  if (!adminShopId || !routableId) {
    return { ok: false, error: 'adminShopId and routableId are required' }
  }

  const config = repairwiseUpdateRoutableWebhookConfig()
  if (!config) {
    return {
      ok: true,
      skipped: true,
      reason: 'REPAIRWISE_SHOP_WEBHOOK_SECRET is not configured',
    }
  }

  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': config.secret,
    },
    body: JSON.stringify({ shopId: adminShopId, routableId }),
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    return {
      ok: false,
      status: res.status,
      error: raw ? `RepairWise webhook failed (${res.status}): ${raw.slice(0, 300)}` : `RepairWise webhook failed (${res.status})`,
    }
  }

  return { ok: true, skipped: false, status: res.status }
}
