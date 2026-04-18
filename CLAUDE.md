# RepairWise Shop CRM

Internal tool for managing repair shop partnerships — pipeline tracking, contract send, email outreach, shop self-service portal, and map view.

## Stack

- **Next.js 14** (App Router)
- **Supabase** (Postgres only — no Supabase Auth)
- **NextAuth.js** (Google OAuth)
- **Tailwind CSS**
- **Resend** (email)
- **Zoho Sign** (contracts)
- **Mapbox GL JS** (map view)

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npx tsx scripts/import.ts   # run data import from CSVs
```

## Environment variables

```bash
# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAILS=khalid@repairwise.com,josh@repairwise.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email
RESEND_API_KEY=

# Contracts
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_SIGN_WEBHOOK_TOKEN=
ZOHO_SIGN_TEMPLATE_ID=

# Map + geocoding
NEXT_PUBLIC_MAPBOX_TOKEN=
GOOGLE_MAPS_API_KEY=

# Portal
PORTAL_JWT_SECRET=
```

---

## Architecture decisions — read before writing any code

### Data model

Four concepts that must not be conflated:

1. **`locations`** — one row per physical shop. Always the atomic unit. Never merge locations.
2. **`accounts`** — business entities (legal or operating name). May control many locations. This is the real FK for contracts, not location.
3. **`contacts`** — people tied to an account and optionally scoped to one location (roles include `owner`, GM, billing, etc.). Email flows use the resolved primary contact (`lib/primary-contact.ts`).
4. **`chain_name`** — a plain text field on `locations` for brand/franchise (Midas, AAMCO). Display and filter only. No separate chains table. Never a FK.

**Why:** The existing Airtable data conflated brand chains with owner-operators. Ali Habib owns Midas DTLA + BH + MDR — one `account`, three `locations`, one `contract` covering all three. Midas-as-a-brand is just `chain_name = 'Midas'` on each location row. Same pattern: Eric Hamini owns AAMCO Bakersfield + Palmdale. Stress Free Auto Care has 28 locations under one contract.

### Auth

Google OAuth via NextAuth.js. No Supabase Auth at all. Whitelist of emails in `ALLOWED_EMAILS` env var. Session stored in cookie. No DB session table needed.

The shop portal (`/portal/[token]`) is **public** — magic link JWT, no login.

### Contracts

- Linked to `account`, not `location`
- `contract_locations` junction table maps which locations a contract covers
- `legal_entity_name` is stored raw from the Zoho Sign signed document — shops sometimes use DBA, sometimes legal entity name. Never normalize or reconcile with location display name.
- Zoho Sign for contract signing

### Program enrollments

Tracked at the **location level**, not account level. Each location has up to 3 program rows (multi_drive, ev_program, oem_warranty). This is correct — a shop might be active on EV but not multi-drive.

---

## Database schema

Apply migrations in order through `supabase/migrations/012_accounts_contacts.sql`. That migration renames `owners` → `accounts`, adds `contacts`, moves person fields off locations, and renames `owner_id` → `account_id` on `locations` and `contracts`.

The excerpt below matches the original `001_initial.sql` bootstrap; live databases after 012 use `accounts`, `contacts`, and `account_id` as in that migration.

```sql
create table owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  title text,
  notes text,
  created_at timestamptz default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain_name text,                 -- text label only, no FK, auto-detected from name

  owner_id uuid references owners(id) on delete set null,

  address_line1 text,
  city text,
  state text,
  postal_code text,
  lat numeric,
  lng numeric,
  geocoded_at timestamptz,

  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,

  status text not null default 'lead'
    check (status in ('lead','contacted','in_review','contracted','active','inactive')),
  assigned_to text,
  source text,
  notes text,

  vf_onboarding_name text,
  vf_onboarding_status text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table program_enrollments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  program text not null check (program in ('multi_drive', 'ev_program', 'oem_warranty')),
  status text not null default 'not_enrolled'
    check (status in ('not_enrolled', 'pending_activation', 'active', 'suspended', 'terminated')),
  enrolled_at timestamptz,
  updated_at timestamptz default now(),
  unique(location_id, program)
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id) on delete set null,

  legal_entity_name text,          -- raw from signed doc, may be DBA or legal, never normalize
  counterparty_company text,
  counterparty_name text,
  counterparty_email text,
  counterparty_phone text,
  counterparty_title text,
  signing_date timestamptz,
  address text,
  standard_labor_rate numeric,
  warranty_labor_rate numeric,
  website text,
  notes text,

  zoho_sign_request_id text,
  status text default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'declined')),
  doc_url text,

  created_at timestamptz default now()
);

create table contract_locations (
  contract_id uuid references contracts(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  primary key (contract_id, location_id)
);

create table comms_log (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  type text not null check (type in ('email', 'note', 'status_change', 'contract', 'address_update')),
  subject text,
  body text,
  to_email text,
  sent_by text,
  created_at timestamptz default now()
);

create index on locations(status);
create index on locations(chain_name);
create index on locations(owner_id);
create index on locations(assigned_to);
create index on program_enrollments(location_id);
create index on contracts(owner_id);
create index on comms_log(location_id);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger locations_updated_at before update on locations
  for each row execute function update_updated_at();
```

---

## Project structure

```
app/
  (internal)/
    layout.tsx              -- sidebar nav, session guard
    shops/
      page.tsx              -- pipeline list (main view)
      new/page.tsx          -- add new shop
      [id]/
        page.tsx            -- shop detail
        edit/page.tsx       -- full edit form
    accounts/
      page.tsx              -- account list
      [id]/page.tsx         -- account detail + contacts
    map/
      page.tsx              -- map view
  (portal)/
    portal/[token]/
      page.tsx              -- shop self-service, public route
  api/
    auth/[...nextauth]/route.ts
    webhooks/zohosign/route.ts
    email/send/route.ts
    portal/
      generate-token/route.ts   -- session auth; mints JWT for shop portal
      location/route.ts         -- public; GET ?token= for portal prefill
      submit-capabilities/route.ts -- public; saves capabilities + pipeline rule
      [token]/update/route.ts   -- public; legacy address/contact updates
    geocode/route.ts
    accounts/               -- account CRUD + search
    contacts/               -- contact CRUD (query by account_id or location_id)
components/
  shop-detail/
    CapabilitiesSection.tsx -- shop detail: submitted capabilities or empty state
  ShopTable.tsx
  StatusBadge.tsx
  ChainBadge.tsx
  ProgramBadge.tsx
  NextActionButton.tsx
  EmailModal.tsx
  AddressForm.tsx
  AccountSelect.tsx
lib/
  supabase.ts               -- supabase client (service role for server, anon for client)
  chain-detect.ts
  email-templates.ts
  geocode.ts
  zohosign.ts
  portal-token.ts
  primary-contact.ts        -- resolvePrimaryContact for lists and email
scripts/
  import.ts                 -- one-time CSV import
```

---

## Auth setup

```typescript
// middleware.ts
export { default } from 'next-auth/middleware'
export const config = {
  matcher: ['/((?!portal|api/webhooks|_next|favicon).*)']
}
```

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  callbacks: {
    async signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAILS!.split(',').map(e => e.trim())
      return allowed.includes(user.email ?? '')
    }
  }
})

export { handler as GET, handler as POST }
```

---

## Chain detection

```typescript
// lib/chain-detect.ts
const KNOWN_CHAINS = [
  'Midas', 'AAMCO', 'Stress Free Auto Care', 'Firestone',
  'Jiffy Lube', 'Pep Boys', 'Mavis', 'Monro', 'Meineke'
]

export function detectChain(shopName: string): string | null {
  const lower = shopName.toLowerCase()
  return KNOWN_CHAINS.find(c => lower.includes(c.toLowerCase())) ?? null
}
```

Run on every location insert/update. If `chain_name` is already set manually, do not overwrite it.

---

## Pipeline list (`/shops`)

The most important page. BDR lives here.

**Columns:** shop name + chain badge, Owner (resolved primary contact name), city/state, status pill, program pills, assigned to, next action button

**Summary bar above table:**
```
Active: 34  Contracted: 12  In review: 8  Contacted: 18  Leads: 26
Chains: Midas (18) · AAMCO (3) · Stress Free (28)
```

**Filters:** status, chain_name, state, assigned_to, program

**Next action button — one per row, driven by status:**

```typescript
const nextAction = {
  lead:       { label: 'Send intro',      action: 'email',    template: 'intro' },
  contacted:  { label: 'Send follow-up',  action: 'email',    template: 'followup' },
  in_review:  { label: 'Send contract',   action: 'contract' },
  contracted: { label: 'Start onboarding',action: 'email',    template: 'onboarding' },
  active:     { label: 'View details',    action: 'navigate' },
  inactive:   { label: 'Re-engage',       action: 'email',    template: 'reengage' },
}
```

Clicking an email action opens `EmailModal` pre-filled with template + contact. On send:
1. POST `/api/email/send` → Resend
2. Insert `comms_log` row
3. Auto-advance status: lead → contacted, contracted → active on onboarding send

---

## Shop detail page (`/shops/[id]`)

Top: name, chain badge, status dropdown (in-place change), assigned_to

**Tabs:**
1. **Details** — inline editable fields. Address section has compact inline "Edit address" form — saves + re-geocodes immediately without navigating away.
2. **Programs** — three rows (Multi-drive, EV, OEM Warranty), each with status dropdown, single save button
3. **Contracts** — contracts via `contract_locations`. Show `legal_entity_name` as "Signed as". Show `standard_labor_rate` and `warranty_labor_rate`. "Send contract via Zoho Sign" button.
4. **Account** — account name with link to `/accounts/[id]`; Contacts section (account-level + location-level)
5. **Comms log** — chronological feed of emails, notes, status changes. "Add note" inline.

---

## Add/edit shop form

Fields:
- Shop name — on blur: run `detectChain()`, auto-fill `chain_name`, show "Detected: Midas" with option to clear
- Chain name — text, pre-filled by detection, always editable
- Account — searchable select with inline "Create new account" option
- Address line 1, City, State, Postal code — on postal code blur: geocode, show confirmation
- Shop contact fields create or update a location-scoped contact (no `primary_contact_*` columns on `locations`)
- Status, Assigned to, Source — dropdowns
- Programs — three rows with status dropdowns
- Notes

---

## Account page (`/accounts/[id]`)

- Account `business_name` and notes (editable)
- Contacts panel (grouped by role; add/edit/delete; primary contact toggle)
- All locations for this account (same table as pipeline view)
- All contracts linked to this account
- Aggregate program enrollment across their locations

---

## Map view (`/map`)

Mapbox GL JS. Query locations where lat/lng not null.

```typescript
const statusColors = {
  lead: '#888780',
  contacted: '#378ADD',
  in_review: '#7F77DD',
  contracted: '#EF9F27',
  active: '#1D9E75',
  inactive: '#E24B4A',
}
```

Click pin → popover with name, chain, status, city, next action button. Filter sidebar mirrors pipeline filters. "Geocode missing addresses" button calls `/api/geocode` for all locations with address but no lat/lng.

---

## Email templates

```typescript
// lib/email-templates.ts
export type TemplateKey = 'intro' | 'followup' | 'onboarding' | 'reengage'

export const templates: Record<TemplateKey, { subject: string; body: string }> = {
  intro: {
    subject: 'RepairWise Partnership — {{shop_name}}',
    body: `Hi {{contact_name}},\n\n[Fill in intro copy]\n\nBest,\n{{sender_name}}`
  },
  followup: {
    subject: 'Following up — RepairWise x {{shop_name}}',
    body: `Hi {{contact_name}},\n\nJust wanted to follow up on my previous note.\n\nBest,\n{{sender_name}}`
  },
  onboarding: {
    subject: 'Welcome to RepairWise — next steps for {{shop_name}}',
    body: `Hi {{contact_name}},\n\nExcited to get {{shop_name}} set up.\n\nBest,\n{{sender_name}}`
  },
  reengage: {
    subject: 'Checking in — RepairWise',
    body: `Hi {{contact_name}},\n\nHoping to reconnect about RepairWise.\n\nBest,\n{{sender_name}}`
  }
}

export function renderTemplate(key: TemplateKey, vars: Record<string, string>) {
  const t = templates[key]
  const replace = (s: string) => s.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? '')
  return { subject: replace(t.subject), body: replace(t.body) }
}
```

---

## Zoho Sign (`lib/zohosign.ts`)

Template merge fields (field_text_data): `standard_labor_rate`, `warranty_labor_rate`, `address`, `phone`, `email`

Do **not** pre-fill business name — shop fills it in themselves (they use DBA or legal name interchangeably, store whatever they write as `legal_entity_name`).

Auth: OAuth 2.0 with refresh token. `getAccessToken()` exchanges `ZOHO_SIGN_REFRESH_TOKEN` for a short-lived access token on every call.

The Zoho Sign request ID is stored in `contracts.zoho_sign_request_id`. If your database was created before this rename, apply migration `004_contracts_zoho_sign_request_id_column.sql` once.

**Webhook at `/api/webhooks/zohosign`:**
- Verified via `ZOHO_SIGN_WEBHOOK_TOKEN` query param
- `request_status === 'completed'` → `signed`
- `request_status === 'recalled'` → `declined`
- `action_status === 'VIEWED'` → `viewed`
- On `signed`: fetch field values from Zoho Sign API → write `legal_entity_name`, `standard_labor_rate`, `warranty_labor_rate` → update linked `locations.status` to `contracted` → log to `comms_log` → send onboarding email via Resend

---

## Shop portal (`/portal/[token]`)

Public route — no NextAuth session. Shop-facing auth is a signed JWT (`PORTAL_JWT_SECRET`).

**Capabilities intake (primary):** BDRs mint a link via `POST /api/portal/generate-token` (requires session). JWT payload is `{ locationId, type: 'portal' }`, **30-day** expiry (`signCapabilitiesPortalToken` in `lib/portal-token.ts`). The portal page loads data with `GET /api/portal/location?token=…` and submits with `POST /api/portal/submit-capabilities`. Submissions write eight columns on `locations` (`bar_license_number`, `hours_of_operation`, `standard_warranty`, `total_techs`, `allocated_techs`, `daily_appointment_capacity`, `weekly_appointment_capacity`, `capabilities_submitted_at`), append an `activity_log` note (`sent_by: portal`), and if the location was **`contacted`**, auto-advance to **`in_review`** with a `status_change` log row. BAR license is collected only when `state` is CA. This flow replaces the old Fillout form; the intro email template uses `{{portal_url}}`, filled at send time after `generate-token`.

**Legacy address/contact updates:** `POST /api/portal/[token]/update` still uses `verifyPortalToken`, which accepts older JWTs that only had `locationId` (no `type`) in addition to `type: 'portal'`.

**Middleware:** Paths under `/portal` and `/api/portal` are excluded from the NextAuth edge matcher so shop owners are not forced through Google sign-in; internal-only routes still check `getAppSession` in the handler.

---

## Geocoding (`lib/geocode.ts`)

```typescript
export async function geocodeAddress(parts: {
  address_line1?: string; city?: string; state?: string; postal_code?: string
}): Promise<{ lat: number; lng: number } | null> {
  const address = [parts.address_line1, parts.city, parts.state, parts.postal_code]
    .filter(Boolean).join(', ')
  if (!address || address.length < 5) return null
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
  )
  const data = await res.json()
  if (data.status !== 'OK') return null
  return data.results[0].geometry.location
}
```

---

## Data import (`scripts/import.ts`)

Run once after schema is live: `npx tsx scripts/import.ts`

Two source CSVs in `scripts/data/`:
- `Locations-Grid_view.csv`
- `Contracts-Grid_view.csv`

**Locations import logic:**
1. `detectChain(shopName)` → set `chain_name`
2. Find or create `account`: match by email first, then name. If chain and no contact, account = chain entity name; ensure a matching contact row where CSV has person fields.
3. Upsert `location`: match on name + city, or name alone if city missing
4. For each non-empty program status column → upsert `program_enrollments`

**Contracts import logic:**
1. Find or create `account` by `counterparty_email`
2. Upsert `contract` row
3. Parse `Shops 2` column (comma-separated) → fuzzy match each to `locations` → insert `contract_locations`
4. No location match → still import contract with `location_id` links empty

**Known data issues — handle gracefully, never crash:**
- Malformed postal codes (`"e Ca "`, `" #108"`) — store as-is, geocoding will return null and skip
- Multiple emails in one field — store raw on the contact `email` field
- Blank company name on contracts — fall back to `counterparty_name`
- L&M Automotive has duplicate contract rows — import both, add note "duplicate"
- Stress Free Auto Care: 28 location rows, 1 contract → 1 account, 28 `contract_locations` rows
- Ali Habib: Midas DTLA + BH + MDR → 1 account, 3 locations, 1 contract with 3 `contract_locations` rows
- Eric Hamini: AAMCO Bakersfield + Palmdale → same pattern

---

## Build order

Build and verify each step before moving to the next.

1. Schema migration — run and confirm tables exist in Supabase
2. Import script — run and verify data looks right in Supabase table editor
3. Google OAuth (NextAuth) — confirm whitelist works, test with both allowed emails
4. `/shops` pipeline list — filters, status badges, next action buttons
5. Shop detail page — tabs, inline address edit, comms log
6. Email send — Resend integration, EmailModal, template rendering
7. Add/edit shop form — chain detection, account select, geocoding
8. Account pages + contacts API
9. Map view + geocode missing button
10. Shop portal (magic link)
11. Zoho Sign webhook

---

## Out of scope

- VinFast sync — separate script, build after DB is live
- Analytics — point Metabase at Supabase separately
- Email scheduling — manual trigger only
- Role-based permissions — email whitelist is sufficient
- Mobile app
