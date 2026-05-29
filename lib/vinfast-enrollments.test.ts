import { describe, expect, it } from 'vitest'
import { normalizeVinfastStage } from '@/lib/vinfast-enrollments'

describe('normalizeVinfastStage', () => {
  it('honors manual kanban override over archived vf_onboarding_status', () => {
    expect(
      normalizeVinfastStage({
        locationStatus: 'active',
        vfOnboardingStatus: 'Archived',
        enrollmentStage: 'active',
        manualStageOverride: true,
      }),
    ).toBe('active')
  })

  it('maps archived vf_onboarding_status to disqualified without override', () => {
    expect(
      normalizeVinfastStage({
        locationStatus: 'active',
        vfOnboardingStatus: 'Archived',
        enrollmentStage: 'not_ready',
        manualStageOverride: false,
      }),
    ).toBe('disqualified')
  })

  it('maps inactive CRM location to disqualified even with manual override', () => {
    expect(
      normalizeVinfastStage({
        locationStatus: 'inactive',
        vfOnboardingStatus: null,
        enrollmentStage: 'active',
        manualStageOverride: true,
      }),
    ).toBe('disqualified')
  })
})
