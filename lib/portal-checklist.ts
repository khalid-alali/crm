// Shop-facing checklist overlay.
//
// The canonical checklist lives in lib/program-config.ts (keys, owner, phase,
// prerequisites). That catalog is authored for an INTERNAL audience, so we never
// show it raw to a shop. This overlay declares, per program:
//   - which item keys are visible to the shop (presence in the map = visible),
//   - the plain-language label the shop sees (shop_label),
//   - whether the shop can mark it done from the portal (completable).
//
// Owner still comes from the canonical catalog: owner==='shop' renders under
// "Your steps", owner fl/vf renders read-only under "Fixlane is handling this".
//
// Security note: this overlay is the allowlist. The portal PATCH route only
// accepts items where completable === true (enforced via isShopCompletable +
// lib/portal-authz). Hiding in the UI is never the boundary.

import {
  getProgramConfig,
  TESLA_FIXLANE_ACCOUNT_READY_KEY,
  TESLA_PORTAL_WALKTHROUGH_KEY,
  TESLA_PROGRAM_ID,
  VINFAST_PROGRAM_ID,
  type ChecklistPrerequisite,
  type ProgramChecklistItem,
} from '@/lib/program-config'

/** A resource button shown in an item's expanded detail (external link). */
export type ShopChecklistLink = {
  label: string
  url: string
  /** Render as the filled primary button. Default false (secondary). */
  primary?: boolean
}

type ShopChecklistMeta = {
  /** Plain-language label shown to the shop. Falls back to the catalog label. */
  shopLabel?: string
  /** Shop can mark this item complete from the portal. Default false (read-only). */
  completable?: boolean
  /** Bold lead line shown when the item is expanded — why this step matters. */
  explainer?: string
  /** Muted secondary line under the explainer — logistics / cost / caveats. */
  note?: string
  /** Optional key/value spec rows (e.g. laptop requirements). */
  spec?: [string, string][]
  /** External resource buttons (EPC signup, eBay/Amazon listing, etc.). */
  links?: ShopChecklistLink[]
  /**
   * Shop-facing "Optional" badge + excluded from the shop progress denominator.
   * Distinct from the catalog's requiredForStage (internal stage logic): a step
   * can be optional to the shop here without touching how stages derive.
   */
  optional?: boolean
}

// Presence of a key here = shop_visible. Curated deliberately: internal ops
// (e.g. "log DSA serial in spreadsheet") are intentionally absent.
const SHOP_VISIBLE: Record<string, Record<string, ShopChecklistMeta>> = {
  [VINFAST_PROGRAM_ID]: {
    // Fixlane / VinFast side — read-only, trust-building.
    labor_rate_approved: { shopLabel: 'Labor rate approved' },
    wall_charger_ordered: { shopLabel: 'Wall charger ordered for your shop' },
    vf_dealer_portal_account_created: { shopLabel: 'Dealer portal account created' },
    vci_shipped: { shopLabel: 'VCI shipped to your shop' },
    technical_training_scheduled: { shopLabel: 'Technical training scheduled' },
    go_live_week_set: { shopLabel: 'Go-live week scheduled' },
    shop_activated: { shopLabel: "You're activated on Fixlane" },
    // Shop side, auto-resolved by data (not a manual portal click).
    routable_payout_method_linked: { shopLabel: 'Link your payout method' },
    first_booking_received: { shopLabel: 'First booking received' },
    // Shop side, completable from the portal.
    technical_training_completed: { shopLabel: 'Complete your technical training', completable: true },
    wall_charger_installed: { shopLabel: 'Confirm your wall charger is installed', completable: true },
    owner_webinar_complete: { shopLabel: 'Complete the owner webinar', completable: true },
    usb_a_cables: {
      shopLabel: 'Purchase USB-A cables for VinFast repairs',
      completable: true,
      explainer:
        'These USB-A cables connect your laptop to the vehicle for VinFast diagnostics. Grab a set so you’re ready the moment VinFast work comes in.',
      links: [{ label: 'Buy on Amazon', url: 'https://www.amazon.com/dp/B07KJFWYXF', primary: true }],
    },
  },
  [TESLA_PROGRAM_ID]: {
    // Tesla setup is almost entirely shop-side (matches the Tesla/EV inspiration).
    epc: {
      shopLabel: 'Create your Tesla EPC account',
      completable: true,
      explainer:
        'Your EPC account is how you look up and order Tesla parts. No account, no parts — and no parts means no repair.',
      note: "Sign up using your shop's business details. Approval usually lands within a day or two.",
      links: [
        { label: 'Open Tesla EPC signup', url: 'https://parts.tesla.com/en-US/landingpage', primary: true },
      ],
    },
    toolbox: {
      shopLabel: 'Subscribe to Tesla Toolbox',
      completable: true,
      optional: true,
      explainer:
        "Toolbox is Tesla's diagnostic software — how you read and clear fault codes, run tests, and finish most repairs. This is the brains of the operation.",
      note: "Toolbox runs $700/year, and you don't have to buy it before you're approved. Most shops wait until their first Tesla job, then subscribe — no reason to start the annual clock early.",
      links: [
        {
          label: 'Go to Toolbox subscription',
          url: 'https://service.tesla.com/en-US/diagnostic-software',
          primary: true,
        },
      ],
    },
    laptop: {
      shopLabel: 'Configure your diagnostics laptop',
      completable: true,
      explainer:
        "Toolbox only runs on a properly set-up machine. Get your laptop dialed in now so you're ready the moment a Tesla rolls in.",
      note: 'Toolbox is Windows-only and picky about hardware. Match this spec, then install Toolbox once your subscription is active.',
      spec: [
        ['OS', 'Windows 10 or 11 (64-bit)'],
        ['Memory', '16 GB RAM minimum'],
        ['Ports', 'USB-A and an Ethernet port (or a USB-C adapter)'],
        ['Network', 'Wireless internet in the bay'],
      ],
    },
    cables: {
      shopLabel: 'Get the required diagnostic cables',
      completable: true,
      explainer:
        "These cables connect your laptop to the vehicle. Without them, Toolbox can't talk to the car — and you can't run a single diagnostic.",
      note: "Order from the approved supplier so you're covered across model years.",
      links: [{ label: 'View cables on eBay', url: 'https://www.ebay.com/itm/126386558302', primary: true }],
    },
    // Fixlane side — read-only. (portal_walkthrough = Fixlane walks you through it.)
    [TESLA_PORTAL_WALKTHROUGH_KEY]: {
      shopLabel: 'Portal walkthrough',
      explainer:
        'This is how you receive jobs, submit findings, talk to RepairWise, and get paid. A few minutes here saves you headaches on every job after.',
    },
    [TESLA_FIXLANE_ACCOUNT_READY_KEY]: {
      shopLabel: 'Fixlane account ready',
      explainer:
        "We review your setup and flip the switch. Once you're approved, Tesla jobs start coming your way.",
    },
  },
  multidrive: {
    // Fixlane sets up the shop's PartsTech account — read-only on the shop side.
    diagnostics: { shopLabel: 'PartsTech account setup' },
  },
}

export type ShopChecklistItem = {
  key: string
  label: string
  owner: 'fl' | 'vf' | 'shop'
  /** "shop" = the shop's own step; "fixlane" = Fixlane/VinFast is handling it. */
  side: 'shop' | 'fixlane'
  completable: boolean
  /** Shop-facing "Optional" — excluded from the shop progress denominator. */
  optional: boolean
  /** Expanded-detail content (all optional). */
  explainer?: string
  note?: string
  spec?: [string, string][]
  links?: ShopChecklistLink[]
  phase?: 1 | 2 | 3 | 4 | 5
  phaseLabel?: string
  prerequisites: ChecklistPrerequisite[]
}

export type ResolvedShopChecklistItem = ShopChecklistItem & {
  completedAt: string | null
  /** Not yet actionable because a prerequisite is incomplete. */
  blocked: boolean
  /** Label of the first unmet prerequisite, for "Unlocks after: X". */
  unlocksAfterLabel: string | null
}

function ownerToSide(owner: ProgramChecklistItem['owner']): 'shop' | 'fixlane' {
  return owner === 'shop' ? 'shop' : 'fixlane'
}

/** Static shop-visible items for a program, in canonical catalog order. */
export function shopVisibleChecklist(programId: string): ShopChecklistItem[] {
  const overlay = SHOP_VISIBLE[programId]
  const config = getProgramConfig(programId)
  if (!overlay || !config) return []

  return config.checklist
    .filter(item => overlay[item.key] !== undefined)
    .map(item => {
      const meta = overlay[item.key]
      const owner = item.owner ?? 'fl'
      return {
        key: item.key,
        label: meta.shopLabel ?? item.label,
        owner,
        side: ownerToSide(owner),
        completable: meta.completable === true,
        optional: meta.optional === true,
        explainer: meta.explainer,
        note: meta.note,
        spec: meta.spec,
        links: meta.links,
        phase: item.phase,
        phaseLabel: item.phaseLabel,
        prerequisites: item.prerequisites ?? [],
      }
    })
}

/** True only if the shop is allowed to mark this item complete from the portal. */
export function isShopCompletable(programId: string, itemKey: string): boolean {
  return SHOP_VISIBLE[programId]?.[itemKey]?.completable === true
}

/**
 * Whether a program belongs in the shop onboarding portal at all. Programs with a
 * shop overlay (VinFast/Tesla/Multidrive) qualify; others (e.g. Expert Assist, a
 * consults surface) are excluded so an Expert-Assist-only shop sees no onboarding.
 */
export function isShopOnboardingProgram(programId: string): boolean {
  return SHOP_VISIBLE[programId] !== undefined
}

/** Default "Need help?" contact when a program has no dedicated owner. */
export const DEFAULT_HELP_EMAIL = 'shops@fixlane.com'

// Per-program "Need help?" contact shown in the shop portal sidebar.
const PROGRAM_HELP_EMAIL: Record<string, string> = {
  [TESLA_PROGRAM_ID]: 'justin@fixlane.com',
  [VINFAST_PROGRAM_ID]: 'nic@fixlane.com',
}

export function programHelpEmail(programId: string): string {
  return PROGRAM_HELP_EMAIL[programId] ?? DEFAULT_HELP_EMAIL
}

/**
 * Resolve completion + blocked state for the shop-visible items, given the set of
 * ALL completed item keys for the enrollment (including hidden internal items,
 * since a visible item can depend on a hidden one).
 *
 * Prerequisite handling:
 *   - string key  → blocked until that key is complete
 *   - {phaseComplete: N} → blocked until every catalog item in phase N is complete
 *   - {afterItem, delayDays} → time-based; treated as not-blocking here (only used
 *     by hidden post-activation items). Revisit if a visible item gains one.
 */
export function resolveShopChecklist(
  programId: string,
  completedAtByKey: Record<string, string | null>,
): ResolvedShopChecklistItem[] {
  const config = getProgramConfig(programId)
  const visible = shopVisibleChecklist(programId)
  const isComplete = (key: string) => !!completedAtByKey[key]

  const phaseComplete = (phase: number): boolean => {
    if (!config) return false
    const inPhase = config.checklist.filter(i => i.phase === phase)
    return inPhase.length > 0 && inPhase.every(i => isComplete(i.key))
  }

  const labelForKey = (key: string): string => {
    const v = visible.find(i => i.key === key)
    if (v) return v.label
    return config?.checklist.find(i => i.key === key)?.label ?? key
  }

  return visible.map(item => {
    const completedAt = completedAtByKey[item.key] ?? null
    let blocked = false
    let unlocksAfterLabel: string | null = null

    if (!completedAt) {
      for (const prereq of item.prerequisites) {
        if (typeof prereq === 'string') {
          if (!isComplete(prereq)) {
            blocked = true
            unlocksAfterLabel = labelForKey(prereq)
            break
          }
        } else if ('phaseComplete' in prereq) {
          if (!phaseComplete(prereq.phaseComplete)) {
            blocked = true
            unlocksAfterLabel = `Phase ${prereq.phaseComplete} complete`
            break
          }
        }
        // {afterItem, delayDays}: not blocking in the shop view (v1).
      }
    }

    return { ...item, completedAt, blocked, unlocksAfterLabel }
  })
}
