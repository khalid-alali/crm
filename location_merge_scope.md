# Location Merge Feature — Scope (v2)

## Goal

Allow BDRs to merge duplicate location records from the pipeline page, keeping the maximum amount of information available and giving the user a clear preview of what survives, what gets overwritten, and what gets combined — with the ability to modify before committing.

This is a forward-looking feature for ongoing duplicate hygiene. The CRM schema will evolve, so the merge logic must not require code changes every time a column is added.

---

## User flow

1. **Pipeline page** — user searches/filters to surface candidate duplicates.
2. **Selection** — checkboxes appear next to each row. User selects exactly 2 locations.
3. **Action bar** — existing bulk bar (currently: change status, enroll in VinFast) gets a new **Merge** button. Disabled unless exactly 2 rows are selected.
4. **Merge preview modal** opens, showing:
   - Auto-picked **primary** (survivor) and **secondary** (will be deleted), with reasoning ("Primary has 12 fields populated vs 7")
   - A toggle to swap primary/secondary
   - A field-by-field diff with the resolved value the user can override
   - A summary of relational data being moved (contacts, contracts, activity log, program enrollments, checklists)
5. **Confirm** — single button "Merge locations". Confirmation dialog warning the action cannot be undone.
6. **Post-merge** — modal closes, pipeline refreshes, surviving location's detail page can be opened via a toast link.

---

## Future-proofing: schema-driven merge

**Core principle: merge logic operates on whatever columns exist on `locations` at the time of merge, not a hardcoded list.**

### How it works

At merge time, the backend introspects the `locations` table schema:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'locations'
  AND column_name NOT IN (
    -- system columns excluded from merge logic
    'id', 'created_at', 'updated_at', 'deleted_at', 'merged_into'
  );
```

(If using Drizzle, this can come from the schema object directly without a runtime DB query.)

For each column returned:
- **Scoring**: count it as populated if the value is non-null and (for strings) non-empty.
- **Field resolution**: apply default rules based on data type (see below).
- **Diff UI**: render in the modal automatically.

This means adding a new column like `next_inspection_due_date` to `locations` requires zero changes to merge code — it shows up in the preview UI on the next merge.

### Default resolution by data type

Built into a single function, applied to every column:

| Data type | Default rule |
|---|---|
| `boolean` | OR (true if either is true) |
| `numeric`, `integer`, `decimal` | Prefer non-null; if both populated, keep primary |
| `text`, `varchar` (short, ≤ 100 chars) | Prefer non-null; if both populated, keep primary |
| `text` (long / notes-like, > 100 chars or matching `*_notes`/`*_description` name pattern) | Concatenate with separator if both populated |
| `timestamp`, `date` | Prefer earlier non-null value (preserves audit history) |
| `jsonb` | Prefer non-null; if both populated, surface conflict to user, no auto-merge of nested keys |
| `enum` (pipeline_stage and similar) | Configured override list (see below) |

### Configured overrides

Some columns need behavior different from the type-based default. Keep this in a small **named map** (not a hardcoded field list) so it's easy to audit:

```ts
const MERGE_OVERRIDES = {
  pipeline_stage: 'most_advanced',  // uses pipeline ordering
  disqualified_at: 'require_confirmation',
  disqualified_reason: 'require_confirmation',
  capabilities_submitted_at: 'earlier',
  // new fields not in this map fall back to type-based defaults
};
```

When a new field needs special handling, you only edit this map — not the merge engine.

### Excluded columns

System columns (`id`, `created_at`, `updated_at`, `deleted_at`, `merged_into`) are excluded by name. Document this list in one place. If a future field needs to be excluded (e.g., a denormalized cache column), add it to the excluded list — but the merge engine doesn't need to change otherwise.

### Same approach for related tables

The same introspection applies to `program_enrollments`, `program_enrollment_checklists`, and `contacts`. New checklist items added to the checklist table will automatically show up in the merge preview.

---

## Auto-pick rule (equal weights)

Score each location by counting non-null, non-empty fields across all introspected `locations` columns (excluding system columns).

**Then add fixed counts from related tables:**
- `+1` per contact
- `+1` per active contract (via `contract_locations`)
- `+1` per active program enrollment
- `+1` per filled-in field across all program enrollment checklists

Each field, each contact, each contract counts equally — one point. Higher score wins. Ties go to the older `created_at`.

The user always sees the score with a one-line breakdown ("Primary: 27 · Secondary: 14") and can swap with one click.

---

## Field resolution UI

For each column, the modal shows three columns: **Primary value · Secondary value · Result**. The "Result" cell is editable.

### Display categories

- **Conflicts** (both sides populated, values differ) — yellow highlight, surfaced at the top of the modal. Real decisions.
- **Auto-filled from secondary** (primary null, secondary populated) — green badge, collapsed-but-listed.
- **Identical or both-null** — collapsed by default behind "Show all fields ▾".

### Special cases

- **Notes-like fields** (long text, or column name matches `*_notes` / `*_description`): default to concatenated value with separator. Editable text area pre-filled.
- **`disqualified_*` fields**: if either side has a disqualified status, surface a warning banner and require explicit user confirmation that the status carries over (or doesn't).
- **`pipeline_stage`**: auto-pick most advanced (Lead < Contacted < In Review < Signed < Active < Churned). Editable.

---

## Relational data handling

### Contacts (`contacts` table)

All contacts from both locations move to the survivor.

**Dedup rules** — two contacts are considered identical if **any** of the following match (after normalization):

- `LOWER(TRIM(name))` matches AND normalized phone matches (`regex_replace(phone, '[^0-9]', '')`)
- `LOWER(TRIM(name))` matches AND `LOWER(TRIM(email))` matches
- normalized phone matches AND `LOWER(TRIM(email))` matches

The "any two of three match" approach catches realistic duplicate cases (same person with slightly different name spelling, shared phone for husband/wife, etc.) without being so loose that it merges legitimately distinct people.

When matched, keep the contact tied to the primary; discard the duplicate from the secondary. Log the dedupe count in the merge preview and in the post-merge activity entry.

Show in modal: "X contacts will be moved · Y duplicate(s) will be deduped"

### Contracts (`contract_locations` junction)

Both contracts survive. Update junction rows where `location_id = secondary.id` → `location_id = primary.id`.

If the same `contract_id` is linked to both locations (rare but possible), drop the duplicate junction row.

If both contracts have a `legal_entity_name` and they differ, show a prominent warning — this is legally sensitive. Don't block, but require an explicit acknowledgment checkbox before commit.

Show in modal: "X contracts will be linked to the surviving location"

### Activity log

All entries from both locations point to the survivor after merge (update `location_id`).

Append a new system entry to the survivor:
> `Merged with [secondary name] ([secondary id]) by [user] on [date]. Combined: [N] contacts, [M] activity entries, [P] tasks.`

Show in modal: "X activity entries will be combined"

### Program enrollments (`program_enrollments`)

For each program either location is enrolled in:

- **Only one side enrolled** → enrollment moves to survivor unchanged.
- **Both sides enrolled** → take the **most advanced** by default (`operational` > `added_to_target_map` > `labor_rate_approved` > basic enrolled). Show side-by-side in modal with all flags; let user pick which row to keep, or merge flags with OR semantics.

### Program enrollment checklists (`program_enrollment_checklists`)

When both sides have a checklist for the same program:

- **Take the most-filled row by default**: count non-null, non-empty values across all checklist fields on each side (using the same introspection approach — don't hardcode the checklist columns). Higher count wins.
- **Field-by-field merge available**: in the modal, expand the checklist row to show each field side-by-side. User can pick either side per field, or use the "Combine: take any non-null" button that pulls populated values from both into one row.
- **Default behavior when no conflicts**: if primary has a field null and secondary has it filled, auto-fill from secondary (same rule as the main location field merge).
- The losing checklist row is deleted after its useful values are transferred.

When only one side has a checklist for a given program, it moves to the survivor unchanged.

Show in modal, per program: "VinFast checklist: 8 fields from primary, 3 from secondary, 1 conflict to resolve".

### Tasks

All open tasks from secondary move to survivor (`location_id` update).

Dedupe: if survivor already has an open task of the same `type`, drop the secondary's task and log the count.

Closed/resolved tasks: move all to survivor for history (no dedupe needed).

---

## What gets deleted

The secondary `locations` row is **soft-deleted** after all references are moved:

- Set `merged_into` → primary's id
- Set `deleted_at` → merge timestamp

All queries against `locations` filter `WHERE deleted_at IS NULL` by default.

If someone visits the secondary's URL post-merge, redirect to the primary with a banner: *"This location was merged into [primary name] on [date]."*

Related rows on `program_enrollment_checklists` and `program_enrollments` that lost out in the merge are hard-deleted (their values have already been carried over to the survivor's row, so there's nothing to preserve).

---

## Modal layout sketch

```
┌─────────────────────────────────────────────────────────────────┐
│ Merge locations                                              [×]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Primary (survives)              Secondary (will be deleted)    │
│  ┌──────────────────────┐        ┌──────────────────────┐       │
│  │ ● Joe's Auto Body    │        │ ○ Joes Auto Body LLC │       │
│  │   123 Main St        │        │   123 Main Street    │       │
│  │   Score: 27          │  [⇄]   │   Score: 14          │       │
│  └──────────────────────┘        └──────────────────────┘       │
│                                                                 │
│  Why this primary: 27 fields/relations populated vs 14          │
│                                                                 │
│  ── Conflicts (3) ──────────────────────────────────────────    │
│  Field             Primary       Secondary    Result            │
│  Pipeline stage    Signed     ⚠ Contacted    [Signed     ▼]    │
│  Labor rate        $145       ⚠ $150         [$145       ▼]    │
│  Calendar system   Tekmetric  ⚠ Shopware     [Tekmetric  ▼]    │
│                                                                 │
│  ── Auto-filled from secondary (4) ─────────────────────────    │
│  ✓ Warranty labor rate ($95)                                   │
│  ✓ BAR license (A123456)                                       │
│  ✓ Chain name (Joe's Auto Group)                               │
│  ✓ Tesla on RP (true)                                          │
│                                                                 │
│  ── Relational data ────────────────────────────────────────    │
│  Contacts:    4 will be moved · 1 duplicate will be deduped     │
│  Contracts:   2 will be linked to surviving location            │
│  Activity:    37 entries will be combined                       │
│  Tasks:       3 open tasks will be moved                        │
│                                                                 │
│  ── Program enrollments ────────────────────────────────────    │
│  VinFast:  keeping primary's enrollment (operational)           │
│  VinFast checklist: 8 from primary, 3 from secondary,           │
│                      1 conflict  [Review checklist ▾]          │
│                                                                 │
│  [Show all 23 unchanged fields ▾]                              │
│                                                                 │
│                                  [Cancel]  [Merge locations]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## API design

### `POST /api/locations/merge/preview`

**Body:** `{ primaryId, secondaryId }`

**Returns:**
```json
{
  "primary": { "id": "...", "name": "...", "score": 27 },
  "secondary": { "id": "...", "name": "...", "score": 14 },
  "fields": [
    { "key": "pipeline_stage", "primary": "signed", "secondary": "contacted", "default": "signed", "type": "conflict" },
    { "key": "bar_license", "primary": null, "secondary": "A123456", "default": "A123456", "type": "autofill" }
  ],
  "relational": {
    "contacts": { "moving": 4, "deduped": 1 },
    "contracts": { "moving": 2, "legalEntityWarning": false },
    "activityEntries": 37,
    "openTasks": 3,
    "programs": [
      {
        "program": "vinfast",
        "resolution": "keep_primary",
        "checklist": {
          "primaryFieldsPopulated": 8,
          "secondaryFieldsPopulated": 5,
          "conflicts": 1,
          "fields": [
            { "key": "labor_rate_approved_date", "primary": "2026-01-15", "secondary": "2026-01-20", "default": "2026-01-15", "type": "conflict" }
          ]
        }
      }
    ]
  }
}
```

The `fields` array is generated by introspecting the schema — the backend doesn't know or care which specific columns exist. Same for the checklist `fields` array.

### `POST /api/locations/merge/commit`

**Body:**
```json
{
  "primaryId": "...",
  "secondaryId": "...",
  "fieldOverrides": { "pipeline_stage": "signed", "notes": "..." },
  "programOverrides": [
    {
      "program": "vinfast",
      "enrollment": "primary",
      "checklistFieldOverrides": { "labor_rate_approved_date": "2026-01-20" }
    }
  ],
  "legalEntityAcknowledged": false
}
```

Runs in a transaction:
1. Validate (preview state still fresh — see edge cases)
2. Update primary's fields with merged values
3. Move contacts (with dedup)
4. Move contract junction rows
5. Move activity log entries
6. Move tasks (with dedup)
7. Resolve program enrollments
8. Merge program enrollment checklists (field-by-field)
9. Soft-delete secondary
10. Insert merge audit entry into activity log

Returns `{ success: true, locationId: primaryId }`.

---

## Schema additions

```sql
ALTER TABLE locations
  ADD COLUMN merged_into UUID REFERENCES locations(id),
  ADD COLUMN deleted_at TIMESTAMP;

CREATE INDEX idx_locations_merged_into ON locations(merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX idx_locations_active ON locations(id) WHERE deleted_at IS NULL;
```

Update all location queries to filter `WHERE deleted_at IS NULL` unless explicitly looking at merged history.

---

## Edge cases

- **Same location selected twice**: validate at modal-open time, show error.
- **Already-merged secondary**: if `secondary.merged_into IS NOT NULL`, block with error "This location was already merged. Merge into [primary name] instead."
- **Disqualified location involved**: warning banner; require explicit user confirmation.
- **Conflicting legal entity names on contracts**: require acknowledgment checkbox.
- **Activity entries > 500 combined**: show count only, don't preview them.
- **Concurrent edits**: at commit time, check `updated_at` on both locations against the preview's snapshot. If either was modified, reject and force re-preview.
- **New column added between preview and commit**: very unlikely, but the commit endpoint re-runs introspection and applies the user's overrides only to fields that still exist. New columns get default-resolved.

---

## Out of scope (defer)

- **Merging more than 2 locations at once** — force iterative merges.
- **Undo / unmerge** — the `merged_into` column gives us the data trail to build this later.
- **Auto-suggesting duplicates** — separate feature.
- **Chain-level merges** — `chain_name` is plain text, no junction to fix.

---

## Build order

1. Schema migration (`merged_into`, `deleted_at`) + update all location queries to filter `deleted_at`
2. **Schema introspection utility** — function that returns the mergeable column list for `locations`, `program_enrollment_checklists`, etc. Write a test that fails if a new column is added without it appearing in the introspection output (catches accidental exclusions early)
3. **Resolution engine** — pure function `(primaryRow, secondaryRow, schema) → resolvedRow`. Unit test against fixture data including all data types
4. Preview endpoint (no UI yet — verify with curl, including with a synthetic new column added to the schema)
5. Commit endpoint with transaction (verify with curl, including rollback on partial failure)
6. Pipeline page: checkbox column + Merge button in bulk action bar
7. Merge preview modal — conflict diff table first, then relational summary, then expandable checklist section
8. Soft-delete redirect on secondary's detail page URL
9. QA pass on edge cases
