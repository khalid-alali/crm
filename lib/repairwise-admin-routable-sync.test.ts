import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  repairwiseUpdateRoutableWebhookConfig,
  shouldSyncRoutableToAdminOnLink,
  syncRoutableIdToRepairwiseAdmin,
} from './repairwise-admin-routable-sync'

describe('shouldSyncRoutableToAdminOnLink', () => {
  it('syncs when routable exists and admin was unlinked', () => {
    expect(
      shouldSyncRoutableToAdminOnLink({
        previousAdminShopId: null,
        routableId: 'fa8efb17-f3fe-4819-a894-a98652e2ed8d',
      }),
    ).toBe(true)
  })

  it('skips when admin was already linked', () => {
    expect(
      shouldSyncRoutableToAdminOnLink({
        previousAdminShopId: '4fd8e25d-66c4-4e2e-4f82c607e67f',
        routableId: 'fa8efb17-f3fe-4819-a894-a98652e2ed8d',
      }),
    ).toBe(false)
  })

  it('skips when routable id is missing', () => {
    expect(
      shouldSyncRoutableToAdminOnLink({
        previousAdminShopId: null,
        routableId: null,
      }),
    ).toBe(false)
  })
})

describe('syncRoutableIdToRepairwiseAdmin', () => {
  beforeEach(() => {
    vi.stubEnv('REPAIRWISE_SHOP_WEBHOOK_SECRET', 'test-secret')
    vi.stubEnv('REPAIRWISE_UPDATE_ROUTABLE_WEBHOOK_URL', 'https://example.test/update_routable_id')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('posts shopId and routableId with x-api-secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncRoutableIdToRepairwiseAdmin({
      adminShopId: '4fd8e25d-66c4-4e2e-4f82c607e67f',
      routableId: 'fa8efb17-f3fe-4819-a894-a98652e2ed8d',
    })

    expect(result).toEqual({ ok: true, skipped: false, status: 200 })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/update_routable_id')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-secret': 'test-secret',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      shopId: '4fd8e25d-66c4-4e2e-4f82c607e67f',
      routableId: 'fa8efb17-f3fe-4819-a894-a98652e2ed8d',
    })
  })

  it('skips when secret is missing', async () => {
    vi.stubEnv('REPAIRWISE_SHOP_WEBHOOK_SECRET', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncRoutableIdToRepairwiseAdmin({
      adminShopId: '4fd8e25d-66c4-4e2e-4f82c607e67f',
      routableId: 'fa8efb17-f3fe-4819-a894-a98652e2ed8d',
    })

    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('repairwiseUpdateRoutableWebhookConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses default URL when env URL is unset', () => {
    vi.stubEnv('REPAIRWISE_SHOP_WEBHOOK_SECRET', 'secret')
    delete process.env.REPAIRWISE_UPDATE_ROUTABLE_WEBHOOK_URL
    expect(repairwiseUpdateRoutableWebhookConfig()?.url).toBe(
      'http://app.repairwise.pro/api/v1/shop/webhook/update_routable_id',
    )
  })
})
