# VinFast checklist — ordering and prerequisite logic

## Why

The catalog in the original brief was authored in CSV-import-mapping order, which is wrong. The catalog should be authored in the order a BDR actually works through it: equipment orders first (long lead time), account setup in parallel, training scheduled once equipment lands, shop-side confirmations last.

Also: many items can't be done until something else is done first. Showing all 27 items at once creates noise — most aren't actionable yet. Prerequisites let the list reveal itself as work progresses.

## Prerequisite model

Each item gets an optional `prerequisites` field listing other `item_key`s that must be complete before the item appears.

```ts
type ChecklistItem = {
  key: string;
  phase: 1 | 2 | 3 | 4 | 5;
  label: string;
  owner: 'fl' | 'vf' | 'shop';
  description?: string;
  prerequisites?: (string | { phaseComplete: 1 | 2 | 3 | 4 | 5 })[];
  autoResolve?: AutoResolveRule;
  action?: ItemAction;
};
```

Two prerequisite types:

- **String** = an `item_key` that must be completed.
- **`{ phaseComplete: N }`** = every item in phase N must be completed. Used by `shop_activated` so we don't have to enumerate all of Phase 3.

Prerequisites can cross phases (a Phase 3 item can depend on a Phase 2 item). That's correct — phase boundaries are workflow grouping, not strict gates.

## UI rendering rules

**Items with unmet prerequisites are hidden by default.** They simply don't appear in the list. This keeps the checklist focused on what's actionable now.

**Each phase header gets a "Show blocked items" toggle** alongside the existing "Show completed items" toggle. When on, blocked items appear in the list in a disabled state with a caption: `Waiting on: {prereq label}`. Off by default.

**Phase progress excludes blocked items by default.** A phase with 11 total items, 3 done, 5 blocked, 3 actionable shows `3 / 6` — denominator counts only what's currently visible. When "Show blocked items" is on, the denominator switches to total (`3 / 11`) so the math matches what's on screen.

**Auto-resolve rules fire regardless of prerequisite state.** If VinFast ships the VCI before the UI says it's actionable, the item still gets marked complete when the event fires. Prerequisites are a UI guide, not a data constraint.

## The catalog (canonical order)

Replace the catalog in the original brief with this. 27 items total.

### Phase 1 · Labor rate approval

| # | Owner | Item key | Label | Prerequisites |
|---|---|---|---|---|
| 1 | FL | `welcome_email_sent` | Welcome email sent | — |
| 2 | FL | `labor_rate_requested` | Labor rate requested from VinFast | `welcome_email_sent` |
| 3 | VF | `labor_rate_approved` | Labor rate approved | `labor_rate_requested` |

### Phase 2 · Setup, training & equipment

| # | Owner | Item key | Label | Prerequisites |
|---|---|---|---|---|
| 1 | FL | `vf_email_sent` | VinFast intro email sent | — |
| 2 | FL | `wall_charger_ordered` | Wall charger ordered | — |
| 3 | VF | `vci_ordered` | VCI ordered | — |
| 4 | FL | `vdsa_ordered` | VDSA ordered | — |
| 5 | FL | `add_shop_to_quickbooks_and_routable` | Add shop to QuickBooks and Routable | — |
| 6 | FL | `dsa_vdsa_account_requested` | DSA / VDSA account requested | `vdsa_ordered` |
| 7 | VF | `vf_dealer_portal_account_created` | VinFast: dealer portal account created and shop added to STP address list | `dsa_vdsa_account_requested` |
| 8 | VF | `vci_shipped` | VinFast: VCI shipped to shop | `vci_ordered`, `vf_dealer_portal_account_created` |
| 9 | FL | `technical_training_scheduled` | Technical training scheduled | `vci_shipped` |
| 10 | Shop | `technical_training_completed` | Technical training completed | `technical_training_scheduled` |
| 11 | FL | `conduct_portal_walkthrough` | Conduct portal walkthrough | `vf_dealer_portal_account_created` |

### Phase 3 · Ready for activation

| # | Owner | Item key | Label | Prerequisites |
|---|---|---|---|---|
| 1 | FL | `dsa_serial_logged` | DSA: log serial number in spreadsheet | `dsa_vdsa_account_requested` |
| 2 | Shop | `wall_charger_installed` | Wall charger installed at shop | `wall_charger_ordered` |
| 3 | Shop | `owner_webinar_complete` | Owner webinar complete | — |
| 4 | Shop | `shop_has_full_access_and_charger` | Shop has DSA, VDSA, portal access and wall charger installed | `dsa_vdsa_account_requested`, `wall_charger_installed` |
| 5 | FL | `stock_parts_order_placed` | Stock parts order placed | `shop_has_full_access_and_charger` |
| 6 | FL | `routable_payout_method_linked` | Routable payout method linked | — |
| 7 | FL | `go_live_week_set` | Go-live week set | `shop_has_full_access_and_charger`, `routable_payout_method_linked` |

### Phase 4 · Activation

| # | Owner | Item key | Label | Prerequisites |
|---|---|---|---|---|
| 1 | FL | `shop_activated` | Shop activated in Fixlane | `{ phaseComplete: 3 }` |
| 2 | FL | `vinfast_notified_of_activation` | VinFast notified of activation | `shop_activated` |
| 3 | Shop | `first_booking_received` | First booking received | `shop_activated` |

### Phase 5 · Post-activation

| # | Owner | Item key | Label | Prerequisites |
|---|---|---|---|---|
| 1 | FL | `month_1_check_in` | Month 1 check-in performed | `shop_activated` (+ 30 day delay) |
| 2 | FL | `month_2_check_in` | Month 2 check-in performed | `month_1_check_in` |
| 3 | VF | `vf_notified_of_operational_status` | VinFast notified of operational status | `month_2_check_in` |

Time-based prerequisites use `{ afterItem: 'shop_activated', delay: '30d' }`. Item appears 30 days after the referenced item completes, not immediately.

## What the BDR sees

Day one for a freshly enrolled shop, Phase 2 shows only items 1–5 (the ones with no prereqs). As the BDR ticks them off, items 6–11 appear in the right order. By the time the shop reaches Phase 3, most of that phase's prerequisites from Phase 2 are already met, so Phase 3 shows up populated with 5–7 actionable items right away.

The list goes from "27 things to do in some order" to "here's what's actionable right now."