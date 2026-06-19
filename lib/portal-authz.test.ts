import { describe, expect, it } from 'vitest'
import { assertEnrollmentOwned, assertShopCompletable, type PortalEnrollmentRow } from '@/lib/portal-authz'
import {
  isShopCompletable,
  isShopOnboardingProgram,
  resolveShopChecklist,
  shopVisibleChecklist,
} from '@/lib/portal-checklist'

const enrollment = (over: Partial<PortalEnrollmentRow> = {}): PortalEnrollmentRow => ({
  id: 'e1',
  location_id: 'loc-A',
  program_id: 'vinfast',
  stage: 'getting_ready',
  manual_stage_override: false,
  first_job_completed_at: null,
  unenrolled_at: null,
  ...over,
})

describe('assertEnrollmentOwned (the IDOR boundary)', () => {
  it('allows an active enrollment owned by the token location', () => {
    expect(assertEnrollmentOwned(enrollment(), 'loc-A')).toEqual({ ok: true })
  })

  it('rejects a foreign enrollment as 404 (does not reveal existence)', () => {
    const res = assertEnrollmentOwned(enrollment({ location_id: 'loc-B' }), 'loc-A')
    expect(res).toEqual({ ok: false, status: 404, error: 'Enrollment not found' })
  })

  it('rejects a missing enrollment as 404', () => {
    expect(assertEnrollmentOwned(null, 'loc-A')).toEqual({
      ok: false,
      status: 404,
      error: 'Enrollment not found',
    })
  })

  it('rejects an unenrolled (inactive) enrollment as 400', () => {
    const res = assertEnrollmentOwned(enrollment({ unenrolled_at: '2026-01-01T00:00:00Z' }), 'loc-A')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(400)
  })
})

describe('assertShopCompletable (privilege boundary)', () => {
  it('allows a shop-completable item', () => {
    expect(assertShopCompletable('vinfast', 'technical_training_completed')).toEqual({ ok: true })
  })

  it('rejects a Fixlane/VinFast-owned read-only item', () => {
    const res = assertShopCompletable('vinfast', 'vci_shipped')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(403)
  })

  it('rejects a hidden internal item', () => {
    expect(assertShopCompletable('vinfast', 'dsa_serial_logged').ok).toBe(false)
  })

  it('rejects an unknown item key', () => {
    expect(assertShopCompletable('vinfast', 'not_a_real_key').ok).toBe(false)
  })

  it('allows a Tesla shop-side item (epc/toolbox/laptop/cables)', () => {
    expect(assertShopCompletable('tesla', 'epc')).toEqual({ ok: true })
    expect(assertShopCompletable('tesla', 'toolbox')).toEqual({ ok: true })
  })

  it('rejects a Tesla Fixlane-side item', () => {
    expect(assertShopCompletable('tesla', 'fixlane_account_ready').ok).toBe(false)
  })

  it('rejects a Multidrive Fixlane-side item (read-only)', () => {
    expect(assertShopCompletable('multidrive', 'diagnostics').ok).toBe(false)
  })

  it('rejects items for an uncurated program', () => {
    expect(assertShopCompletable('expert_assist', 'card_on_file').ok).toBe(false)
  })
})

describe('Tesla overlay', () => {
  it('shows the four shop setup items on the shop side, completable', () => {
    const items = shopVisibleChecklist('tesla')
    const keys = items.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['epc', 'toolbox', 'laptop', 'cables']))
    const epc = items.find(i => i.key === 'epc')
    expect(epc?.side).toBe('shop')
    expect(epc?.completable).toBe(true)
    expect(epc?.label).toBe('Create your Tesla EPC account')
  })

  it('puts fixlane_account_ready on the fixlane side, read-only', () => {
    const item = shopVisibleChecklist('tesla').find(i => i.key === 'fixlane_account_ready')
    expect(item?.side).toBe('fixlane')
    expect(item?.completable).toBe(false)
  })
})

describe('isShopOnboardingProgram (portal program filter)', () => {
  it('includes the curated onboarding programs', () => {
    expect(isShopOnboardingProgram('vinfast')).toBe(true)
    expect(isShopOnboardingProgram('tesla')).toBe(true)
    expect(isShopOnboardingProgram('multidrive')).toBe(true)
  })

  it('excludes Expert Assist (a consults surface, not onboarding)', () => {
    expect(isShopOnboardingProgram('expert_assist')).toBe(false)
  })
})

describe('Multidrive overlay', () => {
  it('shows PartsTech setup as a read-only fixlane item', () => {
    const item = shopVisibleChecklist('multidrive').find(i => i.key === 'diagnostics')
    expect(item?.side).toBe('fixlane')
    expect(item?.completable).toBe(false)
    expect(item?.label).toBe('PartsTech account setup')
  })
})

describe('shop checklist overlay', () => {
  it('exposes only curated shop-visible items, never internal ops', () => {
    const keys = shopVisibleChecklist('vinfast').map(i => i.key)
    expect(keys).toContain('vci_shipped')
    expect(keys).toContain('technical_training_completed')
    expect(keys).not.toContain('dsa_serial_logged')
    expect(keys).not.toContain('add_shop_to_quickbooks_and_routable')
  })

  it('classifies owner into shop vs fixlane side', () => {
    const items = shopVisibleChecklist('vinfast')
    expect(items.find(i => i.key === 'technical_training_completed')?.side).toBe('shop')
    expect(items.find(i => i.key === 'vci_shipped')?.side).toBe('fixlane')
  })

  it('isShopCompletable matches assertShopCompletable', () => {
    expect(isShopCompletable('vinfast', 'wall_charger_installed')).toBe(true)
    expect(isShopCompletable('vinfast', 'vci_shipped')).toBe(false)
  })
})

describe('resolveShopChecklist (blocked / unlocks-after)', () => {
  it('blocks an item whose string prerequisite is incomplete', () => {
    const items = resolveShopChecklist('vinfast', {})
    const training = items.find(i => i.key === 'technical_training_completed')
    // depends on technical_training_scheduled (not complete)
    expect(training?.blocked).toBe(true)
    expect(training?.unlocksAfterLabel).toBe('Technical training scheduled')
  })

  it('unblocks once the prerequisite is complete', () => {
    const items = resolveShopChecklist('vinfast', {
      technical_training_scheduled: '2026-06-10T00:00:00Z',
    })
    const training = items.find(i => i.key === 'technical_training_completed')
    expect(training?.blocked).toBe(false)
    expect(training?.unlocksAfterLabel).toBeNull()
  })

  it('marks an item complete when it has a completion timestamp', () => {
    const items = resolveShopChecklist('vinfast', {
      owner_webinar_complete: '2026-06-12T00:00:00Z',
    })
    const webinar = items.find(i => i.key === 'owner_webinar_complete')
    expect(webinar?.completedAt).toBe('2026-06-12T00:00:00Z')
    expect(webinar?.blocked).toBe(false)
  })
})
