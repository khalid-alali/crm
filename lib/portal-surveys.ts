// Onboarding-portal "intake" surveys surfaced as steps in the shop view.
//   - capabilities (shop-level): existing /portal/[token] form -> locations.capabilities_submitted_at
//   - site (VinFast-specific): /portal/[token]/survey/site -> shop_facility_surveys
//   - technicians (shop-level, invite): /portal/[token]/survey/technicians -> tech_survey_invites
// Completion is submission-driven (decision: technician step is done at >= 1 completed tech).

import type { SupabaseClient } from '@supabase/supabase-js'
import { VINFAST_PROGRAM_ID } from '@/lib/program-config'

export type PortalSurveyStatus = 'not_started' | 'in_progress' | 'submitted'

export type PortalSurveyItem = {
  key: 'capabilities' | 'site' | 'technicians'
  label: string
  status: PortalSurveyStatus
  detail: string
  href: string
  cta: string
}

export type ShopSurveyState = {
  capabilitiesSubmitted: boolean
  siteSubmitted: boolean
  siteHasDraft: boolean
  techTotal: number
  techCompleted: number
}

export async function loadShopSurveyState(
  admin: SupabaseClient,
  locationId: string,
): Promise<ShopSurveyState> {
  const { data: loc } = await admin
    .from('locations')
    .select('capabilities_submitted_at')
    .eq('id', locationId)
    .maybeSingle()

  const { data: site } = await admin
    .from('shop_facility_surveys')
    .select('submitted_at, responses')
    .eq('location_id', locationId)
    .maybeSingle()

  // tech_survey_invites may not exist until migration 064 is applied — tolerate it.
  let techTotal = 0
  let techCompleted = 0
  const { data: invites, error: invErr } = await admin
    .from('tech_survey_invites')
    .select('status')
    .eq('location_id', locationId)
  if (!invErr && invites) {
    techTotal = invites.length
    techCompleted = invites.filter((i: { status: string }) => i.status === 'completed').length
  }

  const siteResponses = (site?.responses ?? {}) as Record<string, unknown>
  return {
    capabilitiesSubmitted: !!loc?.capabilities_submitted_at,
    siteSubmitted: !!site?.submitted_at,
    // shop_name is prefilled, so "has draft" means more than that single key answered.
    siteHasDraft: Object.keys(siteResponses).filter(k => k !== 'shop_name').length > 0,
    techTotal,
    techCompleted,
  }
}

/** Intake survey steps for a program. v1: only VinFast carries the intake section. */
export function surveyItemsForProgram(
  state: ShopSurveyState,
  token: string,
  programId: string,
): PortalSurveyItem[] {
  if (programId !== VINFAST_PROGRAM_ID) return []

  const capabilities: PortalSurveyItem = {
    key: 'capabilities',
    label: 'Shop capabilities survey',
    status: state.capabilitiesSubmitted ? 'submitted' : 'not_started',
    detail: 'Lifts, bays, and the services you offer',
    href: `/portal/${token}`,
    cta: state.capabilitiesSubmitted ? 'View / edit' : 'Start survey',
  }

  const site: PortalSurveyItem = {
    key: 'site',
    label: 'Shop site survey',
    status: state.siteSubmitted ? 'submitted' : state.siteHasDraft ? 'in_progress' : 'not_started',
    detail: 'Facility readiness: power, parking, storage, signage',
    href: `/portal/${token}/survey/site`,
    cta: state.siteSubmitted ? 'View / edit' : state.siteHasDraft ? 'Continue' : 'Start survey',
  }

  const technicians: PortalSurveyItem = {
    key: 'technicians',
    label: 'Technician competency survey',
    status: state.techCompleted >= 1 ? 'submitted' : state.techTotal > 0 ? 'in_progress' : 'not_started',
    detail:
      state.techTotal > 0
        ? `${state.techCompleted} of ${state.techTotal} tech${state.techTotal > 1 ? 's' : ''} done`
        : 'Invite your techs by email — each completes their own survey',
    href: `/portal/${token}/survey/technicians`,
    cta: 'Manage invites',
  }

  return [capabilities, site, technicians]
}
