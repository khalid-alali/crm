# Capability Profile band — implementation spec

## Context
The Admin App shop detail page has a **Capabilities** tab that currently renders the shop's self-reported facts (capacity, service capabilities, operational, technician competency). We are adding a **Capability Profile** band at the top of that tab: five manually-set classification tags that summarize what the shop is approved for. These tags drive job routing — they are not derived from the self-report and must never auto-populate. Each is set by an operator by hand.

Visual + behavioral reference: `capabilities-redesign.html` (open in a browser). Build to match it.

## Placement
Top of the Capabilities tab content, **above** the existing `Capacity` section. Full-width card matching the existing section cards.

## The five tags
Each tag is single-select (radiogroup). All default to `null` (unset) until an operator picks a value. They are independent — setting one never affects another.

| Tag | Field | Options (value → label) |
|-----|-------|-------------------------|
| Eligibility | `eligibility` | `tesla_ev` → "Tesla + EV ready" · `tesla` → "Tesla ready" · `ev` → "EV ready" · `none` → "No EVs" |
| Auto | `auto_depth` | `light` → "Light" · `heavy` → "Heavy" |
| Low voltage | `lv_depth` | `light` → "Light" · `heavy` → "Heavy" |
| High voltage | `hv_depth` | `light` → "Light" · `heavy` → "Heavy" · `heavy_plus` → "Heavy+" |
| ADAS | `adas_depth` | `light` → "Light" · `heavy` → "Heavy" |

Mental model: `eligibility` is a gate (what vehicles route here); the other four are a depth profile (how complex a job within each domain). `eligibility` and `hv_depth` are the EV/HV axes and get the violet selected style; the other three get the dark/neutral selected style.

## Data model (Supabase)
Add five nullable enum-constrained columns to the existing shop-capabilities record (the row backing this tab — confirm the actual table name; likely `shop_capabilities` keyed by `shop_id`). Plus two audit columns.

```sql
alter table shop_capabilities
  add column eligibility text check (eligibility in ('tesla_ev','tesla','ev','none')),
  add column auto_depth  text check (auto_depth  in ('light','heavy')),
  add column lv_depth    text check (lv_depth    in ('light','heavy')),
  add column hv_depth    text check (hv_depth    in ('light','heavy','heavy_plus')),
  add column adas_depth  text check (adas_depth  in ('light','heavy')),
  add column profile_set_by  uuid references users(id),
  add column profile_set_at  timestamptz;
```
All five default to `null`. Do not backfill from any self-reported fields.

## Component
Create `CapabilityProfileBand` (place beside the other capabilities-tab components). Render it as one card with five rows; each row is a label (with a one-line sub-label) on the left and a segmented control on the right.

- Build the segmented control from the existing shadcn pattern used elsewhere in the app — `ToggleGroup` (type `single`) if available, otherwise a `RadioGroup` styled as segments. Do **not** introduce a new primitive; reuse what the active-tab / segmented controls already use.
- Selected segment styling: neutral dimensions → dark fill (`bg-zinc-900 text-white`, matching the active tab). EV/HV dimensions (`eligibility`, `hv_depth`) → violet fill, reusing the same purple already applied to the EV-brand chips in the technician card (don't hardcode a new hex — pull the existing token; fallback `#6d5ee6`).
- Unselected segment: white bg, `text-zinc-500`, `border-zinc-200` (matches the inactive-tab style already in the app).
- When a dimension is `null`, show a muted "Not set" hint next to the control; hide it once a value is set.

## Interaction
- Fully manual. No suggestions, no derivation, no prefill.
- Clicking a segment sets that dimension to its value. Re-clicking the same value is a no-op (single-select; do not allow deselect-to-null via the UI — once set it stays set unless changed to another value).
- Persist on change: optimistic UI update, then upsert the single changed field to Supabase for this `shop_id`, and stamp `profile_set_by = current user` / `profile_set_at = now()`. On failure, revert the optimistic update and toast an error in the app's standard error style.
- Operators with edit access to the shop can change tags; read-only viewers see the band but the controls are disabled.

## Accessibility
- Each control is a `radiogroup` with an `aria-label` (the dimension name); each option is a `radio` with correct `aria-checked`.
- Keyboard: arrow keys move within a group, Space/Enter selects. Visible focus ring.

## Acceptance criteria
1. Band renders at the top of the Capabilities tab, above Capacity, on every shop.
2. All five tags default to "Not set" on a shop that has never had them set.
3. Selecting a value persists immediately and survives a page reload.
4. `eligibility` and High voltage use the violet selected style; Auto / Low voltage / ADAS use the dark selected style.
5. No tag value is ever populated automatically from self-reported data.
6. Read-only users see values but cannot change them.
7. `profile_set_by` / `profile_set_at` update on every change.
