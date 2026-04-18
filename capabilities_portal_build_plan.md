# Shop Capabilities Portal — Implementation Plan

## What this is

Replace the external Fillout form (forms.fillout.com/t/rrBqN67jgtus) with a built-in capabilities intake form tied to the CRM. Shop owners access it via a magic link in the intro email. Data writes directly to the `locations` table and is visible on the shop detail page.

## What you're building

1. A portal page at `/portal/[token]` where shop owners fill in their capabilities (no login required)
2. Three API routes to support the portal (generate token, fetch location, submit form)
3. A capabilities section on the shop detail page showing submitted data
4. Wiring the intro email to include the portal link instead of the Fillout link
5. Auto-advance pipeline from "Contacted" → "In Review" on form submission

---

## Step 1: Schema migration

Run this SQL in Supabase SQL editor:

```sql
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS bar_license_number          TEXT,
  ADD COLUMN IF NOT EXISTS hours_of_operation           TEXT,
  ADD COLUMN IF NOT EXISTS standard_warranty            TEXT,
  ADD COLUMN IF NOT EXISTS total_techs                  INTEGER,
  ADD COLUMN IF NOT EXISTS allocated_techs              INTEGER,
  ADD COLUMN IF NOT EXISTS daily_appointment_capacity   INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_appointment_capacity  INTEGER,
  ADD COLUMN IF NOT EXISTS capabilities_submitted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_locations_capabilities_submitted
  ON locations (capabilities_submitted_at)
  WHERE capabilities_submitted_at IS NULL;
```

**Verify:** Open Supabase table editor → `locations` → confirm the 8 new columns exist.

---

## Step 2: Install jsonwebtoken

```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

Add `PORTAL_JWT_SECRET` to `.env.local` (generate a random 64-char string).

---

## Step 3: Build the three API routes

All three routes go under `app/api/portal/`.

### 3a: `POST /api/portal/generate-token`

- **Auth:** Requires NextAuth session (internal users only)
- **Input:** `{ locationId: string }`
- **Logic:**
  1. Verify location exists in DB
  2. Generate JWT: `jwt.sign({ locationId, type: 'portal' }, PORTAL_JWT_SECRET, { expiresIn: '30d' })`
  3. Return `{ token, portalUrl }` where portalUrl = `${NEXTAUTH_URL}/portal/${token}`
- **Error cases:** 401 if no session, 404 if location not found

### 3b: `GET /api/portal/location?token=xxx`

- **Auth:** Token-based (no NextAuth — this is shop-facing)
- **Logic:**
  1. Verify JWT, check `type === 'portal'`
  2. Query location with owner join: `locations.select('id, name, state, bar_license_number, hours_of_operation, standard_warranty, total_techs, allocated_techs, daily_appointment_capacity, weekly_appointment_capacity, capabilities_submitted_at, owner:owners(contact_name, email, phone)')`
  3. Return `{ location }`
- **Error cases:** 401 if token invalid/expired, 404 if location not found

### 3c: `POST /api/portal/submit-capabilities`

- **Auth:** Token-based
- **Input:** `{ token, bar_license_number?, hours_of_operation, standard_warranty?, total_techs, allocated_techs, daily_appointment_capacity, weekly_appointment_capacity }`
- **Logic:**
  1. Verify JWT
  2. Update `locations` row with all capability fields + set `capabilities_submitted_at = now()`
  3. Insert `comms_log` entry: `{ location_id, type: 'note', body: 'Shop submitted capabilities form via portal', metadata: { total_techs, allocated_techs, daily_capacity, weekly_capacity } }`
  4. Check if `locations.status === 'contacted'` → if yes, update to `'in_review'` + insert another `comms_log` entry with `type: 'status_change'`
- **Error cases:** 401 if token invalid, 500 if DB write fails

**Verify:** Use curl or Postman to hit generate-token (with a valid session cookie), then use the returned token to hit the location endpoint and confirm data comes back.

---

## Step 4: Build the portal page

`app/portal/[token]/page.tsx` — client component, no layout auth wrapper (this page is public).

### Page states (manage with a single state variable)

| State | Trigger | What to show |
|---|---|---|
| `loading` | Initial mount | Spinner |
| `form` | Location loaded, not yet submitted | The form |
| `already_submitted` | `capabilities_submitted_at` is not null | "Already submitted" message |
| `success` | Form submitted successfully | Thank you message |
| `expired` | Token verification returns 401 | "Link expired" message |
| `error` | Any other failure | Generic error message |

### Form behavior

- On mount: `GET /api/portal/location?token=xxx` → pre-fill form with any existing values
- Shop name + owner info (name, email, phone) displayed as read-only confirmation, not editable
- BAR License Number field: **only render if `location.state` is 'CA' or 'CALIFORNIA'**
- Required fields: hours_of_operation, total_techs, allocated_techs, daily_appointment_capacity, weekly_appointment_capacity, and bar_license_number (CA only)
- On submit: `POST /api/portal/submit-capabilities`
- Disable submit button while submitting, show inline error messages on failure

### Styling

- Simple layout: white card on gray background, max-width ~560px, centered
- Branded header with "Fixlane" text (no full nav — shop owners don't need it)
- Use existing Tailwind classes from the project — nothing fancy, just clean and mobile-friendly
- Capacity fields in a 2-column grid on desktop, single column on mobile

**Verify:** Generate a token for a real location, open `/portal/[token]` in an incognito window, confirm pre-fill works, submit, check that the `locations` row updated in Supabase and a `comms_log` entry was created.

---

## Step 5: Add CapabilitiesSection to shop detail page

Create `components/shop-detail/CapabilitiesSection.tsx`.

### Two states

**Not submitted** (`capabilities_submitted_at` is null):
- Dashed border container, centered text: "Shop hasn't submitted their capabilities yet."
- Action link: "Send capabilities form →" (triggers `onSendForm` prop)

**Submitted:**
- Header row: "Shop Capabilities" on left, "Submitted [date]" on right
- 4 stat cards in a row: Total Techs, Allocated to Fixlane, Daily Capacity, Weekly Capacity
  - Each card: large bold number + small gray label below
- Detail rows below: Hours, Warranty, BAR License (CA only)

### Integration

Add this component to the shop detail page. It needs these fields from the location query — make sure the existing detail page query includes them:
`bar_license_number, hours_of_operation, standard_warranty, total_techs, allocated_techs, daily_appointment_capacity, weekly_appointment_capacity, capabilities_submitted_at, state`

**Verify:** Open a shop detail page for a location that has submitted capabilities — confirm the stat cards render. Open one that hasn't — confirm the empty state shows.

---

## Step 6: Wire into intro email

Find the existing intro email send flow (likely triggered by the "Send intro email" button on the shop detail page).

### Changes needed

1. Before sending the email, call `POST /api/portal/generate-token` with the location ID
2. Get back `portalUrl` from the response
3. In the email template, replace the Fillout link with `portalUrl`
4. The email template variable should be `{{portal_url}}` — replace the hardcoded `https://forms.fillout.com/t/rrBqN67jgtus` wherever it appears

### Also update

- The "Send capabilities form" action in the CapabilitiesSection empty state should do the same thing: generate a token and either copy the link to clipboard or open a compose flow
- Log the portal link send to `comms_log`

**Verify:** Click "Send intro email" on a shop, receive the email, click the link, confirm it opens the portal with the correct shop pre-filled.

---

## Step 7: Update CLAUDE.md

Append the portal/capabilities section to the project's CLAUDE.md so future sessions have context. Key points to include:
- The 8 new columns on `locations`
- The three API routes and their auth model (NextAuth vs token)
- The portal page states and behavior
- The pipeline auto-advance rule (contacted → in_review)
- That this replaces the Fillout form

---

## Build order summary

1. Schema migration (SQL) — do first, verify columns exist
2. Install jsonwebtoken
3. API routes (3a, 3b, 3c) — build and test with curl before building the UI
4. Portal page — test end-to-end with a real token
5. CapabilitiesSection component — add to shop detail page
6. Wire into intro email flow
7. Update CLAUDE.md

Do each step in order. Verify each step works before moving to the next.
